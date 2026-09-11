package billingexpr

import (
	"fmt"
	"math"

	"github.com/expr-lang/expr/ast"
)

// MaxRequestMultiplier bounds a dynamic request factor such as
// `per_call(0.05) * param("seconds")`. Hosts validate the underlying request
// fields (duration, image count) before pricing; this ceiling is the engine's
// last line of defense so an unvalidated or hostile value can never scale a
// charge without limit. It matches the host's 3600-second task duration bound.
const MaxRequestMultiplier = 3600

// UsesFixedPricing includes unselected branches, even when compilation later
// optimizes them away. Hosts use it to reject unsupported billing entrances.
func UsesFixedPricing(expression string) bool {
	entry, err := compileEntryFromCacheByHash(expression, ExprHashString(expression))
	return err == nil && entry.fixedPricing
}

func containsPricingMarker(node ast.Node) bool {
	return ast.Find(node, func(part ast.Node) bool {
		identifier, ok := part.(*ast.IdentifierNode)
		return ok && (identifier.Value == "tier" || IsRequestPriceFunction(identifier.Value))
	}) != nil
}

// isRequestPriceMultiplier accepts an admin-authored factor of the documented
// `<probe condition> ? <literal> : 1` shape. Literal zero stays allowed because
// the administrator writes it explicitly; user-controlled factors are validated
// separately by isDynamicRequestMultiplier plus the runtime positivity check.
func isRequestPriceMultiplier(node ast.Node) bool {
	conditional, ok := node.(*ast.ConditionalNode)
	if !ok || !usesRequestProbe(conditional.Cond) || containsPricingMarker(conditional.Cond) {
		return false
	}
	multiplier, multiplierOK := requestRuleNumber(conditional.Exp1)
	fallback, fallbackOK := requestRuleNumber(conditional.Exp2)
	return multiplierOK && fallbackOK && fallback == 1 && multiplier >= 0 && !math.IsNaN(multiplier) && !math.IsInf(multiplier, 0)
}

// isDynamicRequestMultiplier reports whether node reads one bounded request
// value (param/header/u with a literal argument) to scale a request price.
func isDynamicRequestMultiplier(node ast.Node) bool {
	return isDynamicRequestFactor(node)
}

// validateFixedPricingTree enforces one pricing leaf per execution. Without
// this invariant, adding two tiers or multiplying a fixed price by tokens
// would make both the request charge and its billing-unit trace ambiguous.
func validateFixedPricingTree(node ast.Node) error {
	switch part := node.(type) {
	case *ast.ConditionalNode:
		if containsPricingMarker(part.Cond) {
			break
		}
		if err := validateFixedPricingTree(part.Exp1); err != nil {
			return err
		}
		return validateFixedPricingTree(part.Exp2)
	case *ast.BinaryNode:
		if part.Operator != "*" {
			break
		}
		if isRequestPriceMultiplier(part.Right) {
			return validateFixedPricingTree(part.Left)
		}
		if isRequestPriceMultiplier(part.Left) {
			return validateFixedPricingTree(part.Right)
		}
		// Dynamic factors are only meaningful when they scale a priced leaf, and
		// the value is bounded at run time by MaxRequestMultiplier.
		if isDynamicRequestMultiplier(part.Right) && containsPricingMarker(part.Left) {
			return validateFixedPricingTree(part.Left)
		}
		if isDynamicRequestMultiplier(part.Left) && containsPricingMarker(part.Right) {
			return validateFixedPricingTree(part.Right)
		}
	case *ast.CallNode:
		callee, ok := part.Callee.(*ast.IdentifierNode)
		if !ok || callee.Value != "tier" || len(part.Arguments) != 2 || containsPricingMarker(part.Arguments[0]) {
			break
		}
		price := part.Arguments[1]
		if requestPrice, ok := price.(*ast.CallNode); ok {
			function, direct := requestPrice.Callee.(*ast.IdentifierNode)
			if direct && IsRequestPriceFunction(function.Value) && len(requestPrice.Arguments) == 1 {
				amount, literal := requestRuleNumber(requestPrice.Arguments[0])
				if literal && amount >= 0 && !math.IsNaN(amount) && !math.IsInf(amount*1_000_000, 0) {
					return nil
				}
				return fmt.Errorf("fixed price must be a finite, non-negative numeric literal with a finite v1 value")
			}
		}
		if !containsPricingMarker(price) {
			return nil
		}
	}
	return fmt.Errorf("fixed pricing requires tier(name, fixed(amount) or per_call(amount)) leaves, conditional tiers and request multipliers applied outside tier(); token and request charges cannot be combined in one leaf")
}
