package billingexpr

import (
	"fmt"
	"math"
	"strings"
	"sync"

	"github.com/expr-lang/expr"
	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/parser"
	"github.com/expr-lang/expr/vm"
	"github.com/tidwall/gjson"
)

const maxCacheSize = 256

// DefaultExprVersion is used when an expression string has no version prefix.
const DefaultExprVersion = 1

const (
	requestRuleTraceFunction    = "_trace"
	requestRuleTraceIntFunction = "_trace_int"
	requestRuleTraceDynFunction = "_trace_dyn"
	requestRuleTraceDynIntFunc  = "_trace_dyn_int"
)

// RequestPriceFunctionFixed and RequestPriceFunctionPerCall are interchangeable
// names for a request-priced leaf. per_call is the price-list spelling;
// fixed stays supported so existing expressions keep working.
const (
	RequestPriceFunctionFixed   = "fixed"
	RequestPriceFunctionPerCall = "per_call"
)

// IsRequestPriceFunction reports whether a callee names a request-priced leaf.
func IsRequestPriceFunction(name string) bool {
	return name == RequestPriceFunctionFixed || name == RequestPriceFunctionPerCall
}

// ParseExprVersion extracts the version tag and body from an expression string.
// Format: "v1:tier(...)" → version=1, body="tier(...)".
// No prefix defaults to DefaultExprVersion.
func ParseExprVersion(exprStr string) (version int, body string) {
	if strings.HasPrefix(exprStr, "v1:") {
		return 1, exprStr[3:]
	}
	return DefaultExprVersion, exprStr
}

// requestRulePatcher adds trace side effects to existing request multipliers
// without changing the stored expression or its numeric result.
type requestRulePatcher struct {
	requestRules []RequestRuleTrace
	// dynamicMultipliers instruments `leaf * param("path")` factors, which are
	// only valid on request-priced (fixed/per_call) leaves.
	dynamicMultipliers   bool
	restrictedIdentifier string
}

func (p *requestRulePatcher) Visit(node *ast.Node) {
	if identifier, ok := (*node).(*ast.IdentifierNode); ok {
		if isReservedTraceIdentifier(identifier.Value) {
			p.restrictedIdentifier = identifier.Value
		}
		return
	}

	if conditional, ok := (*node).(*ast.ConditionalNode); ok {
		p.patchLiteralMultiplier(node, conditional)
		return
	}
	if binary, ok := (*node).(*ast.BinaryNode); ok && p.dynamicMultipliers {
		p.patchDynamicMultiplier(binary)
	}
}

func isReservedTraceIdentifier(name string) bool {
	switch name {
	case requestRuleTraceFunction, requestRuleTraceIntFunction, requestRuleTraceDynFunction:
		return true
	default:
		return false
	}
}

func (p *requestRulePatcher) patchLiteralMultiplier(node *ast.Node, conditional *ast.ConditionalNode) {
	if !conditional.Ternary || !usesRequestProbe(conditional.Cond) {
		return
	}
	multiplier, ok := requestRuleNumber(conditional.Exp1)
	fallback, fallbackOK := requestRuleNumber(conditional.Exp2)
	if !ok || !fallbackOK || fallback != 1 {
		return
	}

	ruleIndex := len(p.requestRules)
	p.requestRules = append(p.requestRules, RequestRuleTrace{
		Cond:       conditional.Cond.String(),
		Multiplier: multiplier,
	})

	traceFunction := requestRuleTraceFunction
	var multiplierNode ast.Node = &ast.FloatNode{Value: multiplier}
	if _, multiplierIsInt := conditional.Exp1.(*ast.IntegerNode); multiplierIsInt {
		if _, fallbackIsInt := conditional.Exp2.(*ast.IntegerNode); fallbackIsInt {
			traceFunction = requestRuleTraceIntFunction
			multiplierNode = conditional.Exp1
		}
	}

	ast.Patch(node, &ast.CallNode{
		Callee: &ast.IdentifierNode{Value: traceFunction},
		Arguments: []ast.Node{
			&ast.IntegerNode{Value: ruleIndex},
			conditional.Cond,
			multiplierNode,
		},
	})
}

// patchDynamicMultiplier instruments `<pricing leaf> * param("path")` so the
// applied multiplier is bounded and recorded on the billing trace. The patched
// node must be the parent's own field, otherwise the replacement is lost.
func (p *requestRulePatcher) patchDynamicMultiplier(binary *ast.BinaryNode) {
	if binary.Operator != "*" {
		return
	}
	var slot *ast.Node
	switch {
	case isDynamicRequestFactor(binary.Right) && containsPricingMarker(binary.Left):
		slot = &binary.Right
	case isDynamicRequestFactor(binary.Left) && containsPricingMarker(binary.Right):
		slot = &binary.Left
	default:
		return
	}

	ruleIndex := len(p.requestRules)
	p.requestRules = append(p.requestRules, RequestRuleTrace{
		Cond: (*slot).String(),
		// Neutral until the factor is actually read: a dynamic rule in a skipped
		// branch keeps this value with Matched=false.
		Multiplier: 1,
		Dynamic:    true,
	})

	factor := *slot
	ast.Patch(slot, &ast.CallNode{
		Callee: &ast.IdentifierNode{Value: requestRuleTraceDynFunction},
		Arguments: []ast.Node{
			&ast.IntegerNode{Value: ruleIndex},
			factor,
		},
	})
}

// isDynamicRequestFactor reports whether node reads one request value that can
// serve as a multiplier: param/header/u with a single literal argument.
func isDynamicRequestFactor(node ast.Node) bool {
	call, ok := node.(*ast.CallNode)
	if !ok || len(call.Arguments) != 1 {
		return false
	}
	callee, ok := call.Callee.(*ast.IdentifierNode)
	if !ok {
		return false
	}
	switch callee.Value {
	case "param", "header", "u":
	default:
		return false
	}
	_, ok = call.Arguments[0].(*ast.StringNode)
	return ok
}

func requestRuleNumber(node ast.Node) (float64, bool) {
	switch value := node.(type) {
	case *ast.IntegerNode:
		return float64(value.Value), true
	case *ast.FloatNode:
		return value.Value, true
	default:
		return 0, false
	}
}

func usesRequestProbe(node ast.Node) bool {
	return ast.Find(node, func(node ast.Node) bool {
		identifier, ok := node.(*ast.IdentifierNode)
		if !ok {
			return false
		}
		switch identifier.Value {
		case "param", "header", "hour", "minute", "weekday", "month", "day":
			return true
		default:
			return false
		}
	}) != nil
}

type cachedEntry struct {
	prog           *vm.Program
	usedVars       map[string]bool
	usedUsageKeys  map[string]bool
	usedParamPaths map[string]bool
	requestRules   []RequestRuleTrace
	version        int
	fixedPricing   bool
}

var (
	cacheMu sync.RWMutex
	cache   = make(map[string]*cachedEntry, 64)
)

// compileEnvPrototypeV1 is the v1 type-checking prototype used at compile time.
var compileEnvPrototypeV1 = map[string]any{
	"p":          float64(0),
	"c":          float64(0),
	"len":        float64(0),
	"cr":         float64(0),
	"cc":         float64(0),
	"cc1h":       float64(0),
	"img":        float64(0),
	"img_o":      float64(0),
	"ai":         float64(0),
	"ao":         float64(0),
	"tier":       func(string, float64) float64 { return 0 },
	"fixed":      func(float64) float64 { return 0 },
	"per_call":   func(float64) float64 { return 0 },
	"_trace":     func(int, bool, float64) float64 { return 1 },
	"_trace_int": func(int, bool, int) int { return 1 },
	"_trace_dyn": func(int, any) float64 { return 1 },
	"header":     func(string) string { return "" },
	"param":      func(string) any { return nil },
	"u":          func(string) any { return nil },
	"has":        func(any, string) bool { return false },
	"hour":       func(string) int { return 0 },
	"minute":     func(string) int { return 0 },
	"weekday":    func(string) int { return 0 },
	"month":      func(string) int { return 0 },
	"day":        func(string) int { return 0 },
	"max":        math.Max,
	"min":        math.Min,
	"abs":        math.Abs,
	"ceil":       math.Ceil,
	"floor":      math.Floor,
}

func getCompileEnv(version int) map[string]any {
	switch version {
	default:
		return compileEnvPrototypeV1
	}
}

// CompileFromCache compiles an expression string, using a cached program when
// available. The cache is keyed by the SHA-256 hex digest of the expression.
func CompileFromCache(exprStr string) (*vm.Program, error) {
	return compileFromCacheByHash(exprStr, ExprHashString(exprStr))
}

// CompileFromCacheByHash is like CompileFromCache but accepts a pre-computed
// hash, useful when the caller already has the BillingSnapshot.ExprHash.
func CompileFromCacheByHash(exprStr, hash string) (*vm.Program, error) {
	return compileFromCacheByHash(exprStr, hash)
}

func compileFromCacheByHash(exprStr, hash string) (*vm.Program, error) {
	entry, err := compileEntryFromCacheByHash(exprStr, hash)
	if err != nil {
		return nil, err
	}
	return entry.prog, nil
}

func compileEntryFromCacheByHash(exprStr, hash string) (*cachedEntry, error) {
	cacheMu.RLock()
	if entry, ok := cache[hash]; ok {
		cacheMu.RUnlock()
		return entry, nil
	}
	cacheMu.RUnlock()

	version, body := ParseExprVersion(exprStr)
	// Validate before optimization so unreachable fixed-price branches cannot
	// bypass validation or a host's unsupported-protocol checks.
	tree, err := parser.Parse(body)
	if err != nil {
		return nil, fmt.Errorf("expr compile error: %w", err)
	}
	fixedPricing := ast.Find(tree.Node, func(node ast.Node) bool {
		identifier, ok := node.(*ast.IdentifierNode)
		return ok && IsRequestPriceFunction(identifier.Value)
	}) != nil
	if fixedPricing {
		if err := validateFixedPricingTree(tree.Node); err != nil {
			return nil, fmt.Errorf("expr compile error: %w", err)
		}
	}
	patcher := &requestRulePatcher{dynamicMultipliers: fixedPricing}
	prog, err := expr.Compile(body, expr.Env(getCompileEnv(version)), expr.Patch(patcher), expr.AsFloat64())
	if patcher.restrictedIdentifier != "" {
		return nil, fmt.Errorf("expr compile error: identifier %q is reserved for internal use", patcher.restrictedIdentifier)
	}
	if err != nil {
		return nil, fmt.Errorf("expr compile error: %w", err)
	}

	entry := &cachedEntry{
		prog:           prog,
		usedVars:       extractUsedVars(prog),
		usedUsageKeys:  extractUsedUsageKeys(prog),
		usedParamPaths: extractUsedParamPaths(tree.Node),
		requestRules:   patcher.requestRules,
		version:        version,
		fixedPricing:   fixedPricing,
	}
	cacheMu.Lock()
	if len(cache) >= maxCacheSize {
		cache = make(map[string]*cachedEntry, 64)
	}
	cache[hash] = entry
	cacheMu.Unlock()

	return entry, nil
}

// ExprVersion returns the version of a cached expression. Returns DefaultExprVersion
// if the expression hasn't been compiled yet or is empty.
func ExprVersion(exprStr string) int {
	if exprStr == "" {
		return DefaultExprVersion
	}
	hash := ExprHashString(exprStr)
	cacheMu.RLock()
	if entry, ok := cache[hash]; ok {
		cacheMu.RUnlock()
		return entry.version
	}
	cacheMu.RUnlock()
	v, _ := ParseExprVersion(exprStr)
	return v
}

func extractUsedVars(prog *vm.Program) map[string]bool {
	vars := make(map[string]bool)
	node := prog.Node()
	ast.Find(node, func(n ast.Node) bool {
		if id, ok := n.(*ast.IdentifierNode); ok {
			if isReservedTraceIdentifier(id.Value) {
				return false
			}
			vars[id.Value] = true
		}
		return false
	})
	return vars
}

func extractUsedUsageKeys(prog *vm.Program) map[string]bool {
	keys := make(map[string]bool)
	ast.Find(prog.Node(), func(node ast.Node) bool {
		call, ok := node.(*ast.CallNode)
		if !ok || len(call.Arguments) != 1 {
			return false
		}
		callee, ok := call.Callee.(*ast.IdentifierNode)
		if !ok || callee.Value != "u" {
			return false
		}
		literal, ok := call.Arguments[0].(*ast.StringNode)
		if !ok {
			return false
		}
		keys[strings.TrimSpace(literal.Value)] = true
		return false
	})
	return keys
}

// extractUsedParamPaths collects the literal paths an expression reads with
// param("..."). Dynamic path arguments cannot be frozen and are omitted.
func extractUsedParamPaths(node ast.Node) map[string]bool {
	paths := make(map[string]bool)
	ast.Find(node, func(part ast.Node) bool {
		call, ok := part.(*ast.CallNode)
		if !ok || len(call.Arguments) != 1 {
			return false
		}
		callee, ok := call.Callee.(*ast.IdentifierNode)
		if !ok || callee.Value != "param" {
			return false
		}
		literal, ok := call.Arguments[0].(*ast.StringNode)
		if !ok {
			return false
		}
		paths[strings.TrimSpace(literal.Value)] = true
		return false
	})
	return paths
}

// UsedVars returns the set of identifier names referenced by an expression.
// The result is cached alongside the compiled program. Returns nil for empty input.
func UsedVars(exprStr string) map[string]bool {
	if exprStr == "" {
		return nil
	}
	hash := ExprHashString(exprStr)
	cacheMu.RLock()
	if entry, ok := cache[hash]; ok {
		cacheMu.RUnlock()
		return entry.usedVars
	}
	cacheMu.RUnlock()

	// Compile (and cache) to populate usedVars
	if _, err := compileFromCacheByHash(exprStr, hash); err != nil {
		return nil
	}
	cacheMu.RLock()
	entry, ok := cache[hash]
	cacheMu.RUnlock()
	if ok {
		return entry.usedVars
	}
	return nil
}

// UsedUsageKeys returns literal keys referenced by u("...") calls. Calls with
// dynamic arguments are intentionally omitted because they cannot be
// validated statically.
func UsedUsageKeys(exprStr string) map[string]bool {
	if exprStr == "" {
		return nil
	}
	hash := ExprHashString(exprStr)
	cacheMu.RLock()
	if entry, ok := cache[hash]; ok {
		cacheMu.RUnlock()
		return entry.usedUsageKeys
	}
	cacheMu.RUnlock()

	if _, err := compileFromCacheByHash(exprStr, hash); err != nil {
		return nil
	}
	cacheMu.RLock()
	entry, ok := cache[hash]
	cacheMu.RUnlock()
	if ok {
		return entry.usedUsageKeys
	}
	return nil
}

// UsedParamPaths returns the literal JSON paths referenced by param("...") calls.
func UsedParamPaths(exprStr string) map[string]bool {
	if exprStr == "" {
		return nil
	}
	hash := ExprHashString(exprStr)
	cacheMu.RLock()
	if entry, ok := cache[hash]; ok {
		cacheMu.RUnlock()
		return entry.usedParamPaths
	}
	cacheMu.RUnlock()

	if _, err := compileFromCacheByHash(exprStr, hash); err != nil {
		return nil
	}
	cacheMu.RLock()
	entry, ok := cache[hash]
	cacheMu.RUnlock()
	if ok {
		return entry.usedParamPaths
	}
	return nil
}

// FreezeParamFacts copies the request-probe values an expression reads into a
// map that can be stored on a BillingSnapshot. Values already frozen in
// request.Params win, so re-freezing a snapshot is idempotent. Paths that the
// request does not carry are omitted: param() then returns nil, which the
// multiplier rules treat as the neutral default.
func FreezeParamFacts(exprStr string, request RequestInput) map[string]any {
	paths := UsedParamPaths(exprStr)
	if len(paths) == 0 {
		return nil
	}
	facts := make(map[string]any, len(paths))
	for path := range paths {
		if path == "" {
			continue
		}
		if request.Params != nil {
			if value, ok := request.Params[path]; ok {
				facts[path] = value
				continue
			}
		}
		if len(request.Body) == 0 {
			continue
		}
		result := gjson.GetBytes(request.Body, path)
		if !result.Exists() {
			continue
		}
		facts[path] = result.Value()
	}
	if len(facts) == 0 {
		return nil
	}
	return facts
}

// InvalidateCache clears the compiled-expression cache.
// Called when billing rules are updated.
func InvalidateCache() {
	cacheMu.Lock()
	cache = make(map[string]*cachedEntry, 64)
	cacheMu.Unlock()
}
