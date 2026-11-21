package controller

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// LiteLLM 的价格表格式与 models.dev / OpenRouter 都不同：扁平结构里每个模型带
// 每 token 的美元价。自定义价格源依赖这套结构识别，所以这里锁定识别与换算。
func TestConvertLiteLLMToRatioData(t *testing.T) {
	payload := `{
	  "sample_spec": {"input_cost_per_token": "use the model's spec"},
	  "gpt-4o": {"input_cost_per_token": 0.0000025, "output_cost_per_token": 0.00001,
	             "cache_read_input_token_cost": 0.00000125},
	  "free-model": {"input_cost_per_token": 0, "output_cost_per_token": 0},
	  "output-only": {"output_cost_per_token": 0.000002}
	}`
	require.True(t, isLiteLLMPricingPayload([]byte(payload)))

	converted, err := convertLiteLLMToRatioData(strings.NewReader(payload))
	require.NoError(t, err)

	ratios, ok := converted["model_ratio"].(map[string]any)
	require.True(t, ok)
	// $2.5 / 1M tokens == model_ratio 1.25 (ratio 1 is $2 / 1M).
	assert.InDelta(t, 1.25, ratios["gpt-4o"], 1e-9)
	assert.InDelta(t, 0.0, ratios["free-model"], 1e-9)
	assert.NotContains(t, ratios, "output-only", "entries without an input price cannot be converted")

	completion, ok := converted["completion_ratio"].(map[string]any)
	require.True(t, ok)
	assert.InDelta(t, 4.0, completion["gpt-4o"], 1e-9)

	cache, ok := converted["cache_ratio"].(map[string]any)
	require.True(t, ok)
	assert.InDelta(t, 0.5, cache["gpt-4o"], 1e-9)
}

func TestIsLiteLLMPricingPayloadRejectsOtherFormats(t *testing.T) {
	// models.dev / OpenRouter / new-api payloads must keep their own converters.
	assert.False(t, isLiteLLMPricingPayload([]byte(`{"openai":{"models":{"gpt-4o":{"cost":{"input":2.5}}}}}`)))
	assert.False(t, isLiteLLMPricingPayload([]byte(`{"data":[{"id":"gpt-4o","pricing":{"prompt":"0.0000025"}}]}`)))
	assert.False(t, isLiteLLMPricingPayload([]byte(`{"success":true,"data":{}}`)))
	assert.False(t, isLiteLLMPricingPayload([]byte(`not json`)))
}
