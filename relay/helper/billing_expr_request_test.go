package helper

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestResolveIncomingBillingExprRequestInput(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	ctx.Request.Header.Set("Content-Type", "application/json")

	body := []byte(`{"service_tier":"fast"}`)
	ctx.Request.Body = io.NopCloser(bytes.NewReader(body))
	ctx.Set(common.KeyRequestBody, body)

	info := &relaycommon.RelayInfo{
		RequestHeaders: map[string]string{"Content-Type": "application/json"},
	}

	input, err := ResolveIncomingBillingExprRequestInput(ctx, info)
	require.NoError(t, err)
	require.Equal(t, body, input.Body)
	require.Equal(t, "application/json", input.Headers["Content-Type"])
}

func TestBuildBillingExprRequestInputFromRequest(t *testing.T) {
	request := &dto.GeneralOpenAIRequest{
		Model:  "gemini-3.1-pro-preview",
		Stream: lo.ToPtr(true),
		Messages: []dto.Message{
			{
				Role:    "user",
				Content: "hi",
			},
		},
		MaxTokens: lo.ToPtr(uint(3000)),
	}

	input, err := BuildBillingExprRequestInputFromRequest(request, map[string]string{
		"Content-Type": "application/json",
		"X-Test":       "1",
	})
	require.NoError(t, err)
	require.Equal(t, "application/json", input.Headers["Content-Type"])
	require.Equal(t, "1", input.Headers["X-Test"])
	require.True(t, gjson.GetBytes(input.Body, "stream").Bool())
	require.Equal(t, "user", gjson.GetBytes(input.Body, "messages.0.role").String())
	require.Equal(t, float64(3000), gjson.GetBytes(input.Body, "max_tokens").Float())
}

// Image edits arrive as multipart/form-data. param() must still see the price
// dimensions, otherwise a resolution or count tier silently falls back to its
// default branch on that endpoint only.
func TestBillingExprRequestInputReadsMultipartImageEditFields(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var payload bytes.Buffer
	writer := multipart.NewWriter(&payload)
	require.NoError(t, writer.WriteField("model", "gpt-image-1"))
	require.NoError(t, writer.WriteField("size", "1024x1024"))
	require.NoError(t, writer.WriteField("quality", "hd"))
	require.NoError(t, writer.WriteField("n", "2"))
	require.NoError(t, writer.WriteField("prompt", "a cat"))
	filePart, err := writer.CreateFormFile("image", "image.png")
	require.NoError(t, err)
	_, err = filePart.Write([]byte("binary"))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", bytes.NewReader(payload.Bytes()))
	ctx.Request.Header.Set("Content-Type", writer.FormDataContentType())

	input, err := ResolveIncomingBillingExprRequestInput(ctx, &relaycommon.RelayInfo{})
	require.NoError(t, err)

	require.Equal(t, "1024x1024", gjson.GetBytes(input.Body, "size").String())
	require.Equal(t, "a cat", gjson.GetBytes(input.Body, "prompt").String())
	// Canonical numbers are emitted as numbers so `param("n") * price` works the
	// same as on the JSON generations endpoint; file parts stay out of the body.
	require.Equal(t, float64(2), gjson.GetBytes(input.Body, "n").Float())
	require.False(t, gjson.GetBytes(input.Body, "image").Exists())
}
