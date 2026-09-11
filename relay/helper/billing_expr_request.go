package helper

import (
	"maps"
	"math"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
)

func ResolveIncomingBillingExprRequestInput(c *gin.Context, info *relaycommon.RelayInfo) (billingexpr.RequestInput, error) {
	if info != nil && info.BillingRequestInput != nil {
		input := cloneRequestInput(*info.BillingRequestInput)
		merged := cloneStringMap(info.RequestHeaders)
		maps.Copy(merged, input.Headers)
		input.Headers = merged
		return input, nil
	}

	input := billingexpr.RequestInput{}
	if info != nil {
		input.Headers = cloneStringMap(info.RequestHeaders)
	}

	bodyBytes, err := readIncomingBillingExprBody(c)
	if err != nil {
		return billingexpr.RequestInput{}, err
	}
	input.Body = bodyBytes
	return input, nil
}

func BuildBillingExprRequestInputFromRequest(request dto.Request, headers map[string]string) (billingexpr.RequestInput, error) {
	input := billingexpr.RequestInput{
		Headers: cloneStringMap(headers),
	}
	if request == nil {
		return input, nil
	}

	bodyBytes, err := common.Marshal(request)
	if err != nil {
		return billingexpr.RequestInput{}, err
	}
	input.Body = bodyBytes
	return input, nil
}

func readIncomingBillingExprBody(c *gin.Context) ([]byte, error) {
	if c == nil || c.Request == nil {
		return nil, nil
	}
	contentType := c.Request.Header.Get("Content-Type")
	if isJSONContentType(contentType) {
		storage, err := common.GetBodyStorage(c)
		if err != nil {
			return nil, err
		}
		return storage.Bytes()
	}
	if isMultipartContentType(contentType) {
		return multipartFormBody(c)
	}
	return nil, nil
}

// multipartFormBody exposes multipart form fields to param(), so image edits
// (which send size/quality/n as form data) price exactly like the JSON
// generations endpoint. File parts are skipped because they carry no price
// dimension.
func multipartFormBody(c *gin.Context) ([]byte, error) {
	form := c.Request.MultipartForm
	if form == nil {
		parsed, err := common.ParseMultipartFormReusable(c)
		if err != nil {
			return nil, err
		}
		form = parsed
		c.Request.MultipartForm = parsed
	}
	if form == nil || len(form.Value) == 0 {
		return nil, nil
	}

	values := make(map[string]any, len(form.Value))
	for key, list := range form.Value {
		name := strings.TrimSpace(key)
		if name == "" || len(list) == 0 {
			continue
		}
		values[name] = formFieldValue(list[0])
	}
	if len(values) == 0 {
		return nil, nil
	}
	return common.Marshal(values)
}

// formFieldValue keeps form strings as strings but emits canonical numbers as
// numbers, so `param("size") == "1024x1024"` and `param("n") * price` behave the
// same on both image endpoints.
func formFieldValue(raw string) any {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if integer, err := strconv.ParseInt(trimmed, 10, 64); err == nil && strconv.FormatInt(integer, 10) == trimmed {
		return integer
	}
	if number, err := strconv.ParseFloat(trimmed, 64); err == nil &&
		!math.IsNaN(number) && !math.IsInf(number, 0) &&
		strconv.FormatFloat(number, 'f', -1, 64) == trimmed {
		return number
	}
	return raw
}

func cloneRequestInput(src billingexpr.RequestInput) billingexpr.RequestInput {
	input := billingexpr.RequestInput{
		Headers: cloneStringMap(src.Headers),
	}
	if len(src.Body) > 0 {
		input.Body = append([]byte(nil), src.Body...)
	}
	return input
}

func isJSONContentType(contentType string) bool {
	contentType = strings.ToLower(strings.TrimSpace(contentType))
	return strings.HasPrefix(contentType, "application/json")
}

func isMultipartContentType(contentType string) bool {
	return strings.Contains(strings.ToLower(contentType), "multipart/form-data")
}

func cloneStringMap(src map[string]string) map[string]string {
	if len(src) == 0 {
		return map[string]string{}
	}
	dst := make(map[string]string, len(src))
	for key, value := range src {
		if strings.TrimSpace(key) == "" {
			continue
		}
		dst[key] = value
	}
	return dst
}
