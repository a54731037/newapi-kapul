package operation_setting

import (
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateHeaderNavCustomLinksAcceptsEmptyAndValidEntries(t *testing.T) {
	valid := []string{
		"",
		"   ",
		"[]",
		`[{"name":"Docs","url":"https://docs.example.com"}]`,
		`[{"name":"文档","url":"/docs"}]`,
		`[{"name":"Pricing","url":"http://example.com/pricing?a=1#top"}]`,
		`[{"name":"Custom","url":"https://example.com:8443/a/b"}]`,
	}
	for _, value := range valid {
		assert.NoError(t, ValidateHeaderNavCustomLinks(value), value)
	}
}

func TestValidateHeaderNavCustomLinksRejectsNonArrayPayload(t *testing.T) {
	for _, value := range []string{"{}", "null", `"[]"`, "42", "{]"} {
		assert.Error(t, ValidateHeaderNavCustomLinks(value), value)
	}
}

func TestValidateHeaderNavCustomLinksEnforcesCountLimit(t *testing.T) {
	entries := make([]string, 0, MaxHeaderNavCustomLinks+1)
	for i := range MaxHeaderNavCustomLinks + 1 {
		entries = append(entries, `{"name":"tab`+strconv.Itoa(i)+`","url":"/docs"}`)
	}
	assert.NoError(t, ValidateHeaderNavCustomLinks("["+strings.Join(entries[:MaxHeaderNavCustomLinks], ",")+"]"))
	assert.Error(t, ValidateHeaderNavCustomLinks("["+strings.Join(entries, ",")+"]"))
}

func TestValidateHeaderNavCustomLinksRejectsInvalidName(t *testing.T) {
	tooLong := strings.Repeat("a", maxHeaderNavCustomLinkNameLength+1)
	tests := []struct {
		name    string
		payload string
	}{
		{name: "empty", payload: `[{"name":"","url":"/docs"}]`},
		{name: "surrounding whitespace", payload: `[{"name":" Docs","url":"/docs"}]`},
		{name: "too long", payload: `[{"name":"` + tooLong + `","url":"/docs"}]`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Error(t, ValidateHeaderNavCustomLinks(tc.payload))
		})
	}
}

// 自定义链接会原样进入前端 href，必须挡住会被浏览器当成外部跳转的写法。
func TestValidateHeaderNavCustomLinksRejectsUnsafeURL(t *testing.T) {
	tests := []struct {
		name    string
		payload string
	}{
		{name: "empty", payload: `[{"name":"Docs","url":""}]`},
		{name: "blank", payload: `[{"name":"Docs","url":"   "}]`},
		{name: "surrounding whitespace", payload: `[{"name":"Docs","url":" /docs"}]`},
		{name: "protocol relative", payload: `[{"name":"Docs","url":"//evil.example.com"}]`},
		{name: "javascript scheme", payload: `[{"name":"Docs","url":"javascript:alert(1)"}]`},
		{name: "data scheme", payload: `[{"name":"Docs","url":"data:text/html,<script>"}]`},
		{name: "ftp scheme", payload: `[{"name":"Docs","url":"ftp://example.com"}]`},
		{name: "no scheme", payload: `[{"name":"Docs","url":"example.com/docs"}]`},
		{name: "relative", payload: `[{"name":"Docs","url":"docs"}]`},
		{name: "userinfo", payload: `[{"name":"Docs","url":"https://user:pass@example.com"}]`},
		{name: "missing host", payload: `[{"name":"Docs","url":"https://"}]`},
		{name: "backslash", payload: `[{"name":"Docs","url":"https://example.com\\@evil.com"}]`},
		{name: "control character", payload: `[{"name":"Docs","url":"https://example.com\u0000"}]`},
		{name: "newline", payload: "[{\"name\":\"Docs\",\"url\":\"https://example.com\\n\"}]"},
		{name: "internal query", payload: `[{"name":"Docs","url":"/pricing?tab=all"}]`},
		{name: "internal fragment", payload: `[{"name":"Docs","url":"/pricing#top"}]`},
		{name: "too long", payload: `[{"name":"Docs","url":"/` + strings.Repeat("a", maxHeaderNavCustomLinkURLLength) + `"}]`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Error(t, ValidateHeaderNavCustomLinks(tc.payload))
		})
	}
}

func TestValidateHeaderNavCustomLinksAcceptsMaximumLengths(t *testing.T) {
	name := strings.Repeat("a", maxHeaderNavCustomLinkNameLength)
	url := "/" + strings.Repeat("a", maxHeaderNavCustomLinkURLLength-1)
	require.NoError(t, ValidateHeaderNavCustomLinks(`[{"name":"`+name+`","url":"`+url+`"}]`))
}
