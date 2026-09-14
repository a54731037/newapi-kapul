package helper

import (
	"testing"

	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Image sizes arrive as free-form strings, so the tier an expression compares
// against is derived from the long edge instead of a single string comparison.
func TestNormalizeImageResolutionTiers(t *testing.T) {
	tests := []struct {
		name     string
		declared string
		size     string
		want     string
	}{
		{name: "square 1k", size: "1024x1024", want: ImageResolution1K},
		{name: "fullwidth multiplication sign", size: "1024×1024", want: ImageResolution1K},
		{name: "uppercase separator", size: "1024X1024", want: ImageResolution1K},
		{name: "landscape just under 2k", size: "1536x1024", want: ImageResolution2K},
		{name: "square 2048", size: "2048x2048", want: ImageResolution2K},
		{name: "portrait 2160x3840 halfwidth", size: "2160x3840", want: ImageResolution4K},
		{name: "portrait 2160×3840 fullwidth", size: "2160×3840", want: ImageResolution4K},
		{name: "square 4096", size: "4096x4096", want: ImageResolution4K},
		{name: "landscape 3840x2160", size: "3840x2160", want: ImageResolution4K},
		{name: "explicit 1k wins over size", declared: "1k", size: "4096x4096", want: ImageResolution1K},
		{name: "explicit 4k wins over size", declared: "4k", size: "1024x1024", want: ImageResolution4K},
		{name: "explicit resolution is case insensitive", declared: " 4K ", want: ImageResolution4K},
		{name: "provider 1080p maps to 1k", declared: "1080p", want: ImageResolution1K},
		{name: "provider 2160p maps to 4k", declared: "2160p", want: ImageResolution4K},
		// Unknown input must never silently undercharge.
		{name: "missing size", want: HighestResolutionTier},
		{name: "auto size", size: "auto", want: HighestResolutionTier},
		{name: "unparsable size", size: "huge", want: HighestResolutionTier},
		{name: "zero dimension", size: "0x0", want: HighestResolutionTier},
		{name: "single dimension", size: "1024", want: HighestResolutionTier},
		{name: "unknown declared resolution falls back to size", declared: "8k", size: "1024x1024", want: ImageResolution1K},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, NormalizeImageResolution(tc.declared, tc.size))
		})
	}
}

func TestApplyImageResolutionToBillingInput(t *testing.T) {
	body := []byte(`{"model":"gpt-image-1","size":"1344x768","n":2}`)
	input := ApplyImageResolutionToBillingInput(billingexpr.RequestInput{Body: body})
	require.NotNil(t, input.Params)
	// Long edge 1344 is above the 1k boundary, so this request is 2k.
	assert.Equal(t, ImageResolution2K, input.Params["resolution"])

	square := ApplyImageResolutionToBillingInput(billingexpr.RequestInput{
		Body: []byte(`{"model":"gpt-image-1","size":"1024x1024"}`),
	})
	assert.Equal(t, ImageResolution1K, square.Params["resolution"])

	// The derived tier overrides a raw body value for param() lookups.
	overridden := ApplyImageResolutionToBillingInput(billingexpr.RequestInput{
		Body:   []byte(`{"resolution":"1k","size":"3840x2160"}`),
		Params: map[string]any{"resolution": "1k"},
	})
	assert.Equal(t, ImageResolution1K, overridden.Params["resolution"])

	// Full-width separators and a missing size both resolve deterministically.
	assert.Equal(t,
		ImageResolution4K,
		ApplyImageResolutionToBillingInput(billingexpr.RequestInput{Body: []byte(`{"size":"2160×3840"}`)}).Params["resolution"],
	)
	assert.Equal(t,
		HighestResolutionTier,
		ApplyImageResolutionToBillingInput(billingexpr.RequestInput{Body: []byte(`{}`)}).Params["resolution"],
	)
}

// The derived tier is what an expression compares; it must drive tier selection
// through the real engine for every size spelling.
func TestImageResolutionDrivesExpressionTiers(t *testing.T) {
	expression := `param("resolution") == "4k" ? tier("4k", per_call(0.10)) : (param("resolution") == "2k" ? tier("2k", per_call(0.06)) : tier("1k", per_call(0.03)))`
	tests := []struct {
		size string
		tier string
		cost float64
	}{
		{size: "1024x1024", tier: "1k", cost: 30000},
		{size: "1024×1024", tier: "1k", cost: 30000},
		{size: "1536x1024", tier: "2k", cost: 60000},
		{size: "2160x3840", tier: "4k", cost: 100000},
		{size: "2160×3840", tier: "4k", cost: 100000},
		{size: "auto", tier: "4k", cost: 100000},
	}
	for _, tc := range tests {
		t.Run(tc.size, func(t *testing.T) {
			input := ApplyImageResolutionToBillingInput(billingexpr.RequestInput{
				Body: []byte(`{"size":"` + tc.size + `"}`),
			})
			cost, trace, err := billingexpr.RunExprWithRequest(expression, billingexpr.TokenParams{}, input)
			require.NoError(t, err)
			assert.Equal(t, tc.tier, trace.MatchedTier)
			assert.InDelta(t, tc.cost, cost, 1e-6)
		})
	}
}
