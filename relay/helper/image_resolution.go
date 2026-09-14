package helper

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/tidwall/gjson"
)

// Image resolution tiers used by image-generation billing expressions. Billing
// expressions compare param("resolution") against these labels, so the tiers
// must be derived here rather than from a raw size string: providers accept
// free-form dimensions ("1344x768", "1024×1024", "auto") that a single string
// comparison cannot classify.
const (
	ImageResolution1K = "1k"
	ImageResolution2K = "2k"
	ImageResolution4K = "4k"
)

// Long-edge pixel boundaries, chosen so the provider presets administrators
// expect land in the documented tier:
//
//	1k: long edge <= 1600  (1024x1024, 1280x720, 1344x768, 1536x1024)
//	2k: 1601 .. 3072       (1024x1792, 2048x2048, 2560x1440)
//	4k: >= 3073            (2160x3840, 3840x2160, 4096x4096)
const (
	imageResolution2KMinLongEdge = 1601
	imageResolution4KMinLongEdge = 3073
)

// HighestResolutionTier is the tier charged when the request does not declare a
// usable size. Unknown dimensions must not silently bill the cheapest tier.
const HighestResolutionTier = ImageResolution4K

// NormalizeImageResolution maps a request's declared resolution and/or size to
// one of the 1k/2k/4k tiers. An explicit resolution wins; otherwise the longer
// edge of the size decides. Unparseable input returns HighestResolutionTier so
// an unknown request is never undercharged.
func NormalizeImageResolution(declaredResolution string, size string) string {
	if tier, ok := normalizeDeclaredResolution(declaredResolution); ok {
		return tier
	}
	if longEdge, ok := parseSizeLongEdge(size); ok {
		switch {
		case longEdge >= imageResolution4KMinLongEdge:
			return ImageResolution4K
		case longEdge >= imageResolution2KMinLongEdge:
			return ImageResolution2K
		default:
			return ImageResolution1K
		}
	}
	return HighestResolutionTier
}

// normalizeDeclaredResolution accepts the provider spellings of an explicit
// resolution: "1k"/"2k"/"4k" in any case, plus "1080p"/"720p" style labels that
// some channels use for the same ladder.
func normalizeDeclaredResolution(declared string) (string, bool) {
	value := strings.ToLower(strings.TrimSpace(declared))
	if value == "" {
		return "", false
	}
	switch value {
	case "1k", "1024", "1080p", "720p", "hd":
		return ImageResolution1K, true
	case "2k", "1440p", "2kp", "qhd":
		return ImageResolution2K, true
	case "4k", "2160p", "uhd":
		return ImageResolution4K, true
	}
	return "", false
}

// parseSizeLongEdge reads "1024x1024", "1024X1024", "1024×1024", "1024*1024" or
// "1024 1024" and returns the longer edge. Values like "auto" or an empty
// string are rejected so the caller can fall back to the highest tier.
func parseSizeLongEdge(size string) (int, bool) {
	value := strings.TrimSpace(size)
	if value == "" {
		return 0, false
	}
	normalized := strings.NewReplacer(
		"×", "x", "✕", "x", "✖", "x", "⨯", "x", "*", "x", " ", "x", "\t", "x",
	).Replace(strings.ToLower(value))
	parts := strings.Split(normalized, "x")
	if len(parts) != 2 {
		return 0, false
	}
	width, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil || width <= 0 {
		return 0, false
	}
	height, err := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err != nil || height <= 0 {
		return 0, false
	}
	return max(width, height), true
}

// ApplyImageResolutionToBillingInput derives the resolution tier from the
// request body and injects it into the billing-expression input, so expressions
// can compare param("resolution") without reparsing free-form sizes.
//
// The value is written as a request param, which takes precedence over the body
// for param() lookups. A client-provided resolution is still normalised (so
// "4K" and "4k" behave alike) and an unknown size resolves to the highest tier.
func ApplyImageResolutionToBillingInput(input billingexpr.RequestInput) billingexpr.RequestInput {
	resolution := NormalizeImageResolution(
		paramString(input, "resolution"),
		paramString(input, "size"),
	)
	if input.Params == nil {
		input.Params = make(map[string]any, 1)
	}
	input.Params["resolution"] = resolution
	return input
}

// paramString reads a request-probe value as a string, preferring values frozen
// on the input and falling back to the raw JSON body.
func paramString(input billingexpr.RequestInput, path string) string {
	if input.Params != nil {
		if value, ok := input.Params[path]; ok {
			return strings.TrimSpace(fmt.Sprint(value))
		}
	}
	if len(input.Body) == 0 {
		return ""
	}
	result := gjson.GetBytes(input.Body, path)
	if !result.Exists() {
		return ""
	}
	return strings.TrimSpace(result.String())
}
