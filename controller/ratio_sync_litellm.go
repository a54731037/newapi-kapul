package controller

import (
	"fmt"
	"io"
	"math"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

// LiteLLM 的 model_prices_and_context_window.json 采用「模型名 -> 每 token 美元价」
// 的扁平结构，和 models.dev / OpenRouter 都不同。这里按结构识别而不是按域名，
// 所以任意自定义地址（例如 jsDelivr 上的副本）都能直接当上游价格源。
//
// 同一份文件里既有真实的数字价，也有 sample_spec 这类占位字符串，因此按
// any 解码，只采纳能解析成非负数字的条目。

// liteLLMPriceFields are the per-token USD costs a LiteLLM entry may carry.
var liteLLMPriceFields = []string{
	"input_cost_per_token",
	"output_cost_per_token",
	"cache_read_input_token_cost",
	"cache_creation_input_token_cost",
}

func liteLLMCost(value any) (float64, bool) {
	var cost float64
	switch typed := value.(type) {
	case float64:
		cost = typed
	case int:
		cost = float64(typed)
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		if err != nil {
			return 0, false
		}
		cost = parsed
	default:
		return 0, false
	}
	if math.IsNaN(cost) || math.IsInf(cost, 0) || cost < 0 {
		return 0, false
	}
	return cost, true
}

// isLiteLLMPricingPayload reports whether the body looks like a LiteLLM price
// table: a flat object whose values carry per-token USD costs.
func isLiteLLMPricingPayload(body []byte) bool {
	var raw map[string]map[string]any
	if err := common.Unmarshal(body, &raw); err != nil {
		return false
	}
	for _, entry := range raw {
		for _, field := range liteLLMPriceFields {
			if _, ok := liteLLMCost(entry[field]); ok {
				return true
			}
		}
	}
	return false
}

// convertLiteLLMToRatioData converts per-token USD prices into the local ratio
// format: model_ratio is relative to $2/1M tokens (ratio 1 == USD 0.002 / 1K).
func convertLiteLLMToRatioData(reader io.Reader) (map[string]any, error) {
	var upstream map[string]map[string]any
	if err := common.DecodeJson(reader, &upstream); err != nil {
		return nil, fmt.Errorf("failed to decode LiteLLM price table: %w", err)
	}

	names := make([]string, 0, len(upstream))
	for name := range upstream {
		names = append(names, name)
	}
	sort.Strings(names)

	modelRatioMap := make(map[string]any)
	completionRatioMap := make(map[string]any)
	cacheRatioMap := make(map[string]any)

	for _, name := range names {
		if strings.TrimSpace(name) == "" {
			continue
		}
		entry := upstream[name]
		input, ok := liteLLMCost(entry["input_cost_per_token"])
		if !ok {
			continue
		}
		if input == 0 {
			// 只声明 0 价的条目没有可换算的比率。
			modelRatioMap[name] = 0.0
			continue
		}
		inputPerMillion := input * 1_000_000
		modelRatioMap[name] = roundRatioValue(
			inputPerMillion * float64(ratio_setting.USD) / modelsDevInputCostRatioBase,
		)

		if output, ok := liteLLMCost(entry["output_cost_per_token"]); ok {
			completionRatioMap[name] = roundRatioValue(output / input)
		}
		if cacheRead, ok := liteLLMCost(entry["cache_read_input_token_cost"]); ok {
			cacheRatioMap[name] = roundRatioValue(cacheRead / input)
		}
	}

	if len(modelRatioMap) == 0 {
		return nil, fmt.Errorf("no valid LiteLLM pricing entries found")
	}

	converted := make(map[string]any)
	converted["model_ratio"] = modelRatioMap
	if len(completionRatioMap) > 0 {
		converted["completion_ratio"] = completionRatioMap
	}
	if len(cacheRatioMap) > 0 {
		converted["cache_ratio"] = cacheRatioMap
	}
	return converted, nil
}
