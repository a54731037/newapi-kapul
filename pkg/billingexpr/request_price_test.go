package billingexpr_test

import (
	"math"
	"testing"

	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// per_call is the price-list spelling of a request-priced leaf; it must be
// interchangeable with fixed on every path, including the scaled representation
// both billing paths rely on.
func TestPerCallIsEquivalentToFixed(t *testing.T) {
	const expression = `tier("per_second", per_call(0.05)) * param("seconds")`

	cost, trace, err := billingexpr.RunExprWithRequest(
		expression,
		billingexpr.TokenParams{},
		billingexpr.RequestInput{Body: []byte(`{"seconds":8}`)},
	)
	require.NoError(t, err)
	assert.InDelta(t, 0.05*1_000_000*8, cost, 1e-6)
	assert.Equal(t, "per_second", trace.MatchedTier)
	assert.Equal(t, billingexpr.BillingUnitRequest, trace.BillingUnit)
	require.NotNil(t, trace.FixedPrice)
	assert.InDelta(t, 0.05, *trace.FixedPrice, 1e-9)
	require.Len(t, trace.RequestRules, 1)
	assert.True(t, trace.RequestRules[0].Dynamic)
	assert.True(t, trace.RequestRules[0].Matched)
	assert.InDelta(t, 8, trace.RequestRules[0].Multiplier, 1e-9)

	assert.True(t, billingexpr.UsesFixedPricing(expression))
}

func TestPerCallKeepsRequestPriceGrammar(t *testing.T) {
	for _, expression := range []string{
		`tier("bad", per_call(p))`,
		`tier("bad", per_call(-0.01))`,
		`tier("bad", per_call(0.01) + p * 2)`,
		`tier("bad", p * per_call(0.01))`,
		`per_call(0.01)`,
		`tier("bad", per_call(0.01)) * p`,
		`tier("a", per_call(0.01)) + tier("b", p * 2)`,
	} {
		t.Run(expression, func(t *testing.T) {
			_, err := billingexpr.CompileFromCache(expression)
			require.Error(t, err)
		})
	}
}

// A dynamic factor reads one request value. Missing values are neutral so the
// documented API default (one image, one unit) applies; anything present but
// unusable fails closed instead of charging a guess.
func TestDynamicRequestMultiplierBounds(t *testing.T) {
	const expression = `tier("base", per_call(0.02)) * param("n")`

	tests := []struct {
		name      string
		body      string
		wantCost  float64
		wantMatch bool
		wantMult  float64
		clamped   bool
		wantErr   string
	}{
		{name: "absent value stays neutral", body: `{}`, wantCost: 0.02 * 1_000_000, wantMult: 1},
		{name: "empty string stays neutral", body: `{"n":""}`, wantCost: 0.02 * 1_000_000, wantMatch: true, wantMult: 1},
		{name: "json number scales the price", body: `{"n":3}`, wantCost: 0.06 * 1_000_000, wantMatch: true, wantMult: 3},
		{name: "numeric string scales the price", body: `{"n":"4"}`, wantCost: 0.08 * 1_000_000, wantMatch: true, wantMult: 4},
		{
			name:     "oversized value saturates at the engine ceiling",
			body:     `{"n":100000}`,
			wantCost: 0.02 * 1_000_000 * billingexpr.MaxRequestMultiplier,
			// MaxRequestMultiplier is the clamp ceiling; the rule still matched.
			wantMatch: true,
			wantMult:  billingexpr.MaxRequestMultiplier,
			clamped:   true,
		},
		{name: "zero stays neutral instead of making the request free", body: `{"n":0}`, wantCost: 0.02 * 1_000_000, wantMult: 1},
		{name: "negative fails closed", body: `{"n":-2}`, wantErr: "must not be negative"},
		{name: "non-numeric fails closed", body: `{"n":"many"}`, wantErr: "is not a number"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cost, trace, err := billingexpr.RunExprWithRequest(
				expression,
				billingexpr.TokenParams{},
				billingexpr.RequestInput{Body: []byte(tc.body)},
			)
			if tc.wantErr != "" {
				require.ErrorContains(t, err, tc.wantErr)
				return
			}
			require.NoError(t, err)
			assert.InDelta(t, tc.wantCost, cost, 1e-6)
			require.Len(t, trace.RequestRules, 1)
			assert.Equal(t, tc.wantMatch, trace.RequestRules[0].Matched)
			assert.InDelta(t, tc.wantMult, trace.RequestRules[0].Multiplier, 1e-9)
			assert.Equal(t, tc.clamped, trace.RequestRules[0].Clamped)
		})
	}
}

// Task settlement runs after submission, so the request-probe values an
// expression reads must be frozen on the snapshot instead of re-read from a body
// that no longer exists.
func TestParamFactsFreezeKeepsSettlementIdentical(t *testing.T) {
	const expression = `param("resolution") == "4k" ? tier("4k", per_call(0.05)) * param("n") : tier("std", per_call(0.03)) * param("n")`
	body := []byte(`{"resolution":"4k","n":2,"prompt":"ignored"}`)
	request := billingexpr.RequestInput{Body: body}

	submitted, _, err := billingexpr.RunExprWithRequest(expression, billingexpr.TokenParams{}, request)
	require.NoError(t, err)

	facts := billingexpr.FreezeParamFacts(expression, request)
	assert.Equal(t, map[string]any{"resolution": "4k", "n": float64(2)}, facts)

	settled, trace, err := billingexpr.RunExprWithRequest(
		expression,
		billingexpr.TokenParams{},
		billingexpr.RequestInput{Params: facts},
	)
	require.NoError(t, err)
	assert.InDelta(t, submitted, settled, 1e-9)
	assert.Equal(t, "4k", trace.MatchedTier)
	assert.InDelta(t, 0.05*1_000_000*2, settled, 1e-6)
}

func TestUsedParamPathsOnlyReportsLiteralPaths(t *testing.T) {
	paths := billingexpr.UsedParamPaths(`param("size") == "1024x1024" ? tier("1k", per_call(0.03)) : tier("2k", per_call(0.03)) * param("n")`)
	assert.Equal(t, map[string]bool{"size": true, "n": true}, paths)
	assert.Empty(t, billingexpr.UsedParamPaths(`tier("base", per_call(0.01) * param(dynamic_path))`))
}

// A task usage expression whose evaluated branch is request-priced must settle
// with the same dollar meaning as the token path, while usage-fact terms keep
// their "already USD" meaning.
func TestTaskUsageRequestPriceSettlement(t *testing.T) {
	expression := `tier("per_second", per_call(0.05)) * u("seconds")`
	snap := &billingexpr.BillingSnapshot{
		ExprString:       expression,
		ExprHash:         billingexpr.ExprHashString(expression),
		GroupRatio:       2,
		QuotaPerUnit:     500000,
		TaskUsageBilling: true,
	}

	result, err := billingexpr.ComputeTieredQuotaWithRequest(
		snap,
		billingexpr.TokenParams{},
		billingexpr.RequestInput{Usage: map[string]any{"seconds": float64(8)}},
	)
	require.NoError(t, err)
	// $0.05 per second * 8 seconds * 500000 quota/USD * 2 group ratio
	assert.Equal(t, int(0.4*500000*2), result.ActualQuotaAfterGroup)
	assert.Equal(t, billingexpr.BillingUnitRequest, result.BillingUnit)

	usageOnly := `tier("base", u("seconds") * 0.4)`
	usageSnap := &billingexpr.BillingSnapshot{
		ExprString:       usageOnly,
		ExprHash:         billingexpr.ExprHashString(usageOnly),
		GroupRatio:       1,
		QuotaPerUnit:     500000,
		TaskUsageBilling: true,
	}
	usageResult, err := billingexpr.ComputeTieredQuotaWithRequest(
		usageSnap,
		billingexpr.TokenParams{},
		billingexpr.RequestInput{Usage: map[string]any{"seconds": float64(10)}},
	)
	require.NoError(t, err)
	assert.Equal(t, int(4.0*500000), usageResult.ActualQuotaAfterGroup)
	assert.Equal(t, billingexpr.BillingUnitToken, usageResult.BillingUnit)
}

func TestUSDExpressionOutputIsPathAware(t *testing.T) {
	assert.InDelta(t, 0.05, billingexpr.USDExpressionOutput(0.05*1_000_000, true, billingexpr.BillingUnitRequest), 1e-9)
	assert.InDelta(t, 0.4, billingexpr.USDExpressionOutput(0.4, true, billingexpr.BillingUnitToken), 1e-9)
	assert.InDelta(t, 0.05, billingexpr.USDExpressionOutput(0.05*1_000_000, false, billingexpr.BillingUnitRequest), 1e-9)
	assert.False(t, math.IsNaN(billingexpr.USDExpressionOutput(0, false, billingexpr.BillingUnitToken)))
}
