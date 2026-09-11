package billingexpr

import (
	"github.com/QuantumNous/new-api/common"
)

// expressionOutputUSD converts a raw expression result into USD for the
// snapshot's billing path.
//
// v1 coefficients are $/1M for token prices and for request-priced
// (fixed/per_call) leaves. Task usage expressions instead already return the
// request's dollar cost, so they are used as-is — except request-priced leaves,
// which keep the scaled representation so `tier("per_second", per_call(0.05))`
// means the same $0.05 per unit on the token and the task path.
func expressionOutputUSD(exprOutput float64, snap *BillingSnapshot, unit BillingUnit) float64 {
	if snap.TaskUsageBilling {
		if unit == BillingUnitRequest {
			return exprOutput / 1_000_000
		}
		return exprOutput
	}
	switch snap.ExprVersion {
	default: // v1: coefficients are $/1M tokens prices
		return exprOutput / 1_000_000
	}
}

// USDExpressionOutput is expressionOutputUSD for callers that compute a quota
// before they hold a snapshot (the task submission path).
func USDExpressionOutput(exprOutput float64, taskUsageBilling bool, unit BillingUnit) float64 {
	probe := &BillingSnapshot{TaskUsageBilling: taskUsageBilling, ExprVersion: DefaultExprVersion}
	return expressionOutputUSD(exprOutput, probe, unit)
}

// quotaConversion converts raw expression output to quota based on the
// expression version. This is the central dispatch point for future versions
// that may use a different conversion formula.
func quotaConversion(exprOutput float64, snap *BillingSnapshot, unit BillingUnit) float64 {
	return expressionOutputUSD(exprOutput, snap, unit) * snap.QuotaPerUnit
}

// ComputeTieredQuota runs the Expr from a frozen BillingSnapshot against
// actual token counts and returns the settlement result.
func ComputeTieredQuota(snap *BillingSnapshot, params TokenParams) (TieredResult, error) {
	return ComputeTieredQuotaWithRequest(snap, params, RequestInput{})
}

func ComputeTieredQuotaWithRequest(snap *BillingSnapshot, params TokenParams, request RequestInput) (TieredResult, error) {
	cost, trace, err := RunExprByHashWithRequest(snap.ExprString, snap.ExprHash, params, request)
	if err != nil {
		return TieredResult{}, err
	}

	quotaBeforeGroup := quotaConversion(cost, snap, trace.BillingUnit)
	afterGroup, clamp := common.QuotaRoundChecked(quotaBeforeGroup * snap.GroupRatio)
	crossed := trace.MatchedTier != snap.EstimatedTier

	return TieredResult{
		BillingUnit:            trace.BillingUnit,
		FixedPrice:             trace.FixedPrice,
		ActualQuotaBeforeGroup: quotaBeforeGroup,
		ActualQuotaAfterGroup:  afterGroup,
		MatchedTier:            trace.MatchedTier,
		RequestRules:           trace.RequestRules,
		CrossedTier:            crossed,
		Clamp:                  clamp,
	}, nil
}
