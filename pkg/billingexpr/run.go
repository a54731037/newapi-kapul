package billingexpr

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/expr-lang/expr"
	"github.com/expr-lang/expr/vm"
	"github.com/tidwall/gjson"
)

// RunExpr compiles (with cache) and executes an expression string.
// The environment exposes:
//   - p, c             — prompt / completion tokens (auto-excluding separately-priced sub-categories)
//   - len              — total input context length for tier conditions (never reduced by sub-category exclusion)
//   - cr, cc, cc1h     — cache read / creation / creation-1h tokens
//   - tier(name, value) — trace callback that records which tier matched
//   - max, min, abs, ceil, floor — standard math helpers
//
// Returns the resulting float64 quota (before group ratio) and a TraceResult
// with side-channel info captured by tier() during execution.
func RunExpr(exprStr string, params TokenParams) (float64, TraceResult, error) {
	return RunExprWithRequest(exprStr, params, RequestInput{})
}

func RunExprWithRequest(exprStr string, params TokenParams, request RequestInput) (float64, TraceResult, error) {
	entry, err := compileEntryFromCacheByHash(exprStr, ExprHashString(exprStr))
	if err != nil {
		return 0, TraceResult{}, err
	}
	return runProgram(entry.prog, entry.requestRules, params, request)
}

// RunExprByHash is like RunExpr but accepts a pre-computed hash for the cache
// lookup, avoiding a redundant SHA-256 computation when the caller already
// holds BillingSnapshot.ExprHash.
func RunExprByHash(exprStr, hash string, params TokenParams) (float64, TraceResult, error) {
	return RunExprByHashWithRequest(exprStr, hash, params, RequestInput{})
}

func RunExprByHashWithRequest(exprStr, hash string, params TokenParams, request RequestInput) (float64, TraceResult, error) {
	entry, err := compileEntryFromCacheByHash(exprStr, hash)
	if err != nil {
		return 0, TraceResult{}, err
	}
	return runProgram(entry.prog, entry.requestRules, params, request)
}

func runProgram(prog *vm.Program, requestRules []RequestRuleTrace, params TokenParams, request RequestInput) (float64, TraceResult, error) {
	trace := TraceResult{
		BillingUnit:  BillingUnitToken,
		RequestRules: append([]RequestRuleTrace(nil), requestRules...),
	}
	headers := normalizeHeaders(request.Headers)

	env := map[string]any{
		"p":     params.P,
		"c":     params.C,
		"len":   params.Len,
		"cr":    params.CR,
		"cc":    params.CC,
		"cc1h":  params.CC1h,
		"img":   params.Img,
		"img_o": params.ImgO,
		"ai":    params.AI,
		"ao":    params.AO,
		"tier": func(name string, value float64) float64 {
			trace.MatchedTier = name
			trace.Cost = value
			return value
		},
		"fixed":    requestPrice(&trace),
		"per_call": requestPrice(&trace),
		requestRuleTraceFunction: func(ruleIndex int, matched bool, multiplier float64) float64 {
			if matched && ruleIndex >= 0 && ruleIndex < len(trace.RequestRules) {
				trace.RequestRules[ruleIndex].Matched = true
			}
			if matched {
				return multiplier
			}
			return 1
		},
		requestRuleTraceIntFunction: func(ruleIndex int, matched bool, multiplier int) int {
			if matched && ruleIndex >= 0 && ruleIndex < len(trace.RequestRules) {
				trace.RequestRules[ruleIndex].Matched = true
			}
			if matched {
				return multiplier
			}
			return 1
		},
		requestRuleTraceDynFunction: func(ruleIndex int, value any) float64 {
			multiplier, matched, clamped, err := boundedRequestMultiplier(value)
			if err != nil {
				if trace.RequestMultiplierErr == "" {
					trace.RequestMultiplierErr = err.Error()
				}
				return 0
			}
			if ruleIndex >= 0 && ruleIndex < len(trace.RequestRules) {
				rule := &trace.RequestRules[ruleIndex]
				rule.Matched = matched
				rule.Multiplier = multiplier
				rule.Clamped = clamped
			}
			if clamped {
				common.SysError(fmt.Sprintf(
					"billing expression request multiplier %s saturated to %d: %v",
					requestRuleCondition(trace, ruleIndex), MaxRequestMultiplier, value,
				))
			}
			return multiplier
		},
		"header": func(key string) string {
			return headers[strings.ToLower(strings.TrimSpace(key))]
		},
		"param": func(path string) any {
			path = strings.TrimSpace(path)
			if path == "" {
				return nil
			}
			if request.Params != nil {
				if value, ok := request.Params[path]; ok {
					return value
				}
			}
			if len(request.Body) == 0 {
				return nil
			}
			result := gjson.GetBytes(request.Body, path)
			if !result.Exists() {
				return nil
			}
			return result.Value()
		},
		"u": func(name string) any {
			if request.Usage == nil {
				return nil
			}
			return request.Usage[strings.TrimSpace(name)]
		},
		"has": func(source any, substr string) bool {
			if source == nil || substr == "" {
				return false
			}
			return strings.Contains(fmt.Sprint(source), substr)
		},
		"hour":    func(tz string) int { return timeInZone(tz).Hour() },
		"minute":  func(tz string) int { return timeInZone(tz).Minute() },
		"weekday": func(tz string) int { return int(timeInZone(tz).Weekday()) },
		"month":   func(tz string) int { return int(timeInZone(tz).Month()) },
		"day":     func(tz string) int { return timeInZone(tz).Day() },
		"max":     math.Max,
		"min":     math.Min,
		"abs":     math.Abs,
		"ceil":    math.Ceil,
		"floor":   math.Floor,
	}

	out, err := expr.Run(prog, env)
	if err != nil {
		return 0, trace, fmt.Errorf("expr run error: %w", err)
	}
	if trace.RequestMultiplierErr != "" {
		return 0, trace, fmt.Errorf("expr run error: %s", trace.RequestMultiplierErr)
	}
	f, ok := out.(float64)
	if !ok {
		return 0, trace, fmt.Errorf("expr result is %T, want float64", out)
	}
	return f, trace, nil
}

// requestPrice builds the request-priced leaf function. fixed and per_call are
// the same contract: the amount is a USD price for one request, scaled by
// 1,000,000 so both billing paths keep v1's quota conversion and rounding.
func requestPrice(trace *TraceResult) func(float64) float64 {
	return func(amount float64) float64 {
		trace.BillingUnit = BillingUnitRequest
		trace.FixedPrice = &amount
		return amount * 1_000_000
	}
}

// boundedRequestMultiplier converts a user-controlled request value into the
// multiplier it contributes to a request price. An absent or zero value is
// neutral (1): that matches the documented API default for count/duration
// fields and keeps a zero from making a request free. Anything present but
// unusable fails closed instead of charging a guess, and an oversized value is
// saturated at MaxRequestMultiplier.
func boundedRequestMultiplier(value any) (multiplier float64, matched bool, clamped bool, err error) {
	if value == nil {
		return 1, false, false, nil
	}
	numeric, ok := requestValueAsFloat(value)
	if !ok {
		return 0, false, false, fmt.Errorf("request multiplier %v (%T) is not a number", value, value)
	}
	if math.IsNaN(numeric) || math.IsInf(numeric, 0) {
		return 0, false, false, fmt.Errorf("request multiplier %v is not finite", value)
	}
	if numeric < 0 {
		return 0, false, false, fmt.Errorf("request multiplier %v must not be negative", value)
	}
	if numeric == 0 {
		return 1, false, false, nil
	}
	if numeric > MaxRequestMultiplier {
		return MaxRequestMultiplier, true, true, nil
	}
	return numeric, true, false, nil
}

// requestValueAsFloat accepts the JSON shapes param()/u() return plus the
// numeric strings multipart form fields produce.
func requestValueAsFloat(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case uint:
		return float64(typed), true
	case uint64:
		return float64(typed), true
	case json.Number:
		parsed, err := typed.Float64()
		return parsed, err == nil
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return 1, true
		}
		parsed, err := strconv.ParseFloat(trimmed, 64)
		if err != nil {
			return 0, false
		}
		return parsed, true
	default:
		return 0, false
	}
}

// requestRuleCondition returns the recorded condition of a traced rule for logs.
func requestRuleCondition(trace TraceResult, ruleIndex int) string {
	if ruleIndex >= 0 && ruleIndex < len(trace.RequestRules) {
		return trace.RequestRules[ruleIndex].Cond
	}
	return "unknown"
}

func timeInZone(tz string) time.Time {
	tz = strings.TrimSpace(tz)
	if tz == "" {
		return time.Now().UTC()
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return time.Now().UTC()
	}
	return time.Now().In(loc)
}

func normalizeHeaders(headers map[string]string) map[string]string {
	if len(headers) == 0 {
		return map[string]string{}
	}
	normalized := make(map[string]string, len(headers))
	for key, value := range headers {
		k := strings.ToLower(strings.TrimSpace(key))
		v := strings.TrimSpace(value)
		if k == "" || v == "" {
			continue
		}
		normalized[k] = v
	}
	return normalized
}
