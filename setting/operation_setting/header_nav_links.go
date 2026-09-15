package operation_setting

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
)

// HeaderNavCustomLink 是管理员自定义的顶部导航条目。
type HeaderNavCustomLink struct {
	Name string `json:"name"`
	Url  string `json:"url"`
}

const (
	// MaxHeaderNavCustomLinks 限制顶部导航自定义条目数量，避免导航栏被无限撑开。
	MaxHeaderNavCustomLinks = 20
	// maxHeaderNavCustomLinkNameLength 限制导航名称的字符数（按码点计）。
	maxHeaderNavCustomLinkNameLength = 32
	// maxHeaderNavCustomLinkURLLength 限制导航链接长度。
	maxHeaderNavCustomLinkURLLength = 512
)

// ValidateHeaderNavCustomLinks 校验管理员提交的自定义顶部导航列表。
// 空字符串表示没有自定义条目，是合法配置。
//
// 链接会原样进入前端 href，因此这里必须拒绝非 http(s) 协议、协议相对地址
// （//host）和反斜杠等会被浏览器重新解释为外部跳转的写法。
func ValidateHeaderNavCustomLinks(value string) error {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	if common.GetJsonType(json.RawMessage(trimmed)) != "array" {
		return errors.New("顶部导航自定义链接必须是 JSON 数组")
	}

	var links []HeaderNavCustomLink
	if err := common.UnmarshalJsonStr(trimmed, &links); err != nil {
		return fmt.Errorf("解析顶部导航自定义链接失败: %w", err)
	}
	if len(links) > MaxHeaderNavCustomLinks {
		return fmt.Errorf("顶部导航自定义链接最多 %d 条", MaxHeaderNavCustomLinks)
	}

	for i, link := range links {
		if err := validateHeaderNavCustomLink(link); err != nil {
			return fmt.Errorf("第 %d 条自定义链接无效：%w", i+1, err)
		}
	}
	return nil
}

func validateHeaderNavCustomLink(link HeaderNavCustomLink) error {
	if link.Name == "" || link.Name != strings.TrimSpace(link.Name) {
		return errors.New("名称不能为空且不能包含首尾空白")
	}
	if utf8.RuneCountInString(link.Name) > maxHeaderNavCustomLinkNameLength {
		return fmt.Errorf("名称最多 %d 个字符", maxHeaderNavCustomLinkNameLength)
	}

	raw := link.Url
	if raw == "" || raw != strings.TrimSpace(raw) {
		return errors.New("链接不能为空且不能包含首尾空白")
	}
	if len(raw) > maxHeaderNavCustomLinkURLLength {
		return fmt.Errorf("链接最多 %d 个字符", maxHeaderNavCustomLinkURLLength)
	}
	if strings.ContainsRune(raw, '\\') || strings.IndexFunc(raw, unicode.IsControl) >= 0 {
		return errors.New("链接不能包含反斜杠或控制字符")
	}

	if strings.HasPrefix(raw, "/") {
		if strings.HasPrefix(raw, "//") {
			return errors.New("站内链接不能以 // 开头")
		}
		// 站内路径交给前端路由匹配，形如 /pricing?tab=all 的写法需要走完整
		// http(s) 地址，避免把查询串误当成路径的一部分。
		if strings.ContainsAny(raw, "?#") {
			return errors.New("站内链接不能包含 ? 或 #，需要带参数时请填写完整 http(s) 地址")
		}
		return nil
	}

	parsed, err := url.Parse(raw)
	if err != nil {
		return errors.New("链接格式无效")
	}
	if !strings.EqualFold(parsed.Scheme, "http") && !strings.EqualFold(parsed.Scheme, "https") {
		return errors.New("链接必须以 / 开头，或使用 http(s) 协议")
	}
	if parsed.Host == "" || parsed.User != nil || parsed.Opaque != "" {
		return errors.New("链接必须包含主机名且不能包含用户信息")
	}
	return nil
}
