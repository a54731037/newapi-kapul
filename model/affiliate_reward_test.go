package model

import (
	"fmt"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// useAffiliateConfigForTest 固定邀请返利配置，并在用例结束后还原全局状态。
func useAffiliateConfigForTest(t *testing.T, quotaForInviter int, quotaForInvitee int, rate float64, complianceConfirmed bool) {
	t.Helper()
	originalInviter, originalInvitee := common.QuotaForInviter, common.QuotaForInvitee
	originalRate, originalExpireDays := common.AffCommissionRate, common.AffCommissionExpireDays
	paymentSetting := operation_setting.GetPaymentSetting()
	originalConfirmed, originalTermsVersion := paymentSetting.ComplianceConfirmed, paymentSetting.ComplianceTermsVersion
	t.Cleanup(func() {
		common.QuotaForInviter, common.QuotaForInvitee = originalInviter, originalInvitee
		common.AffCommissionRate, common.AffCommissionExpireDays = originalRate, originalExpireDays
		paymentSetting.ComplianceConfirmed = originalConfirmed
		paymentSetting.ComplianceTermsVersion = originalTermsVersion
	})

	common.QuotaForInviter = quotaForInviter
	common.QuotaForInvitee = quotaForInvitee
	common.AffCommissionRate = rate
	common.AffCommissionExpireDays = 0
	paymentSetting.ComplianceConfirmed = complianceConfirmed
	if complianceConfirmed {
		paymentSetting.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
	}
}

func resetAffiliateTables(t *testing.T) {
	t.Helper()
	truncateTables(t)
	require.NoError(t, DB.AutoMigrate(&InviteIPLog{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&InviteIPLog{}).Error)
	t.Cleanup(func() {
		DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&InviteIPLog{})
	})
}

var affiliateUserSeq int

func createAffiliateUser(t *testing.T, affCode string, inviterId int, quota int) User {
	t.Helper()
	affiliateUserSeq++
	user := User{
		Username:  fmt.Sprintf("affiliate-user-%d", affiliateUserSeq),
		AffCode:   affCode,
		InviterId: inviterId,
		Quota:     quota,
		Status:    common.UserStatusEnabled,
		CreatedAt: common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(&user).Error)
	return user
}

func reloadAffiliateUser(t *testing.T, id int) User {
	t.Helper()
	var user User
	require.NoError(t, DB.First(&user, id).Error)
	return user
}

// 被邀请人奖励必须与邀请人奖励受同一 IP 去重约束，否则同一个人可以用自己的
// 邀请码反复注册小号刷取被邀请人奖励。
func TestAwardInviteRewardsDeduplicatesBothSidesPerIP(t *testing.T) {
	resetAffiliateTables(t)
	useAffiliateConfigForTest(t, 1000, 500, 0, true)

	inviter := createAffiliateUser(t, "dedup-inviter", 0, 0)
	firstInvitee := createAffiliateUser(t, "dedup-invitee-1", inviter.Id, 0)
	secondInvitee := createAffiliateUser(t, "dedup-invitee-2", inviter.Id, 0)

	awardInviteRewards(firstInvitee.Id, inviter.Id, "203.0.113.9")
	assert.Equal(t, 500, reloadAffiliateUser(t, firstInvitee.Id).Quota)
	assert.Equal(t, 1000, reloadAffiliateUser(t, inviter.Id).AffQuota)
	assert.Equal(t, 1, reloadAffiliateUser(t, inviter.Id).AffCount)

	// 同一 IP + 同一邀请人：第二次注册双方都不再发奖
	awardInviteRewards(secondInvitee.Id, inviter.Id, "203.0.113.9")
	assert.Equal(t, 0, reloadAffiliateUser(t, secondInvitee.Id).Quota)
	assert.Equal(t, 1000, reloadAffiliateUser(t, inviter.Id).AffQuota)
	assert.Equal(t, 1, reloadAffiliateUser(t, inviter.Id).AffCount)

	// 换一个 IP 后恢复正常发放
	awardInviteRewards(secondInvitee.Id, inviter.Id, "198.51.100.4")
	assert.Equal(t, 500, reloadAffiliateUser(t, secondInvitee.Id).Quota)
	assert.Equal(t, 2000, reloadAffiliateUser(t, inviter.Id).AffQuota)
	assert.Equal(t, 2, reloadAffiliateUser(t, inviter.Id).AffCount)
	assert.Equal(t, 2000, reloadAffiliateUser(t, inviter.Id).AffHistoryQuota)
}

func TestAwardInviteRewardsRequiresPaymentCompliance(t *testing.T) {
	resetAffiliateTables(t)
	useAffiliateConfigForTest(t, 1000, 500, 0, false)

	inviter := createAffiliateUser(t, "compliance-inviter", 0, 0)
	invitee := createAffiliateUser(t, "compliance-invitee", inviter.Id, 0)

	awardInviteRewards(invitee.Id, inviter.Id, "203.0.113.11")

	assert.Equal(t, 0, reloadAffiliateUser(t, invitee.Id).Quota)
	assert.Equal(t, 0, reloadAffiliateUser(t, inviter.Id).AffQuota)
	assert.Equal(t, 0, reloadAffiliateUser(t, inviter.Id).AffCount)

	var slots int64
	require.NoError(t, DB.Model(&InviteIPLog{}).Count(&slots).Error)
	assert.Zero(t, slots, "未确认合规时不应占用邀请奖励名额")
}

// aff_quota/aff_history 是 INT 列，越界累加必须失败而不是依赖数据库报错或写入越界值。
func TestCreditAffQuotaRefusesToOverflowIntColumn(t *testing.T) {
	resetAffiliateTables(t)

	inviter := createAffiliateUser(t, "overflow-inviter", 0, 0)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", inviter.Id).Updates(map[string]any{
		"aff_quota":   common.MaxAffQuotaReward - 10,
		"aff_history": common.MaxAffQuotaReward - 10,
	}).Error)

	require.Error(t, creditAffQuota(inviter.Id, 100, nil))
	reloaded := reloadAffiliateUser(t, inviter.Id)
	assert.Equal(t, common.MaxAffQuotaReward-10, reloaded.AffQuota)
	assert.Equal(t, common.MaxAffQuotaReward-10, reloaded.AffHistoryQuota)

	// 未越界时正常累加
	require.NoError(t, DB.Model(&User{}).Where("id = ?", inviter.Id).Updates(map[string]any{
		"aff_quota":   0,
		"aff_history": 0,
	}).Error)
	require.NoError(t, creditAffQuota(inviter.Id, 100, nil))
	reloaded = reloadAffiliateUser(t, inviter.Id)
	assert.Equal(t, 100, reloaded.AffQuota)
	assert.Equal(t, 100, reloaded.AffHistoryQuota)
}

// 返佣是额度乘法：越界比例要按服务端上限钳制，超大乘积要饱和，绝不能算出负额度。
func TestCreditAffiliateCommissionClampsOversizedValues(t *testing.T) {
	resetAffiliateTables(t)
	useAffiliateConfigForTest(t, 0, 0, 1e9, true)

	inviter := createAffiliateUser(t, "commission-inviter", 0, 0)
	topUpUser := createAffiliateUser(t, "commission-topup", inviter.Id, 0)

	// 历史库中的越界比例按 20% 上限钳制
	CreditAffiliateCommission(topUpUser.Id, 1_000_000)
	assert.Equal(t, 200_000, reloadAffiliateUser(t, inviter.Id).AffQuota)

	// 乘积超出 int32：饱和到 MaxQuota，而不是溢出成负额度
	useAffiliateConfigForTest(t, 0, 0, common.MaxAffCommissionRate, true)
	saturatedInviter := createAffiliateUser(t, "commission-saturated", 0, 0)
	saturatedTopUpUser := createAffiliateUser(t, "commission-saturated-topup", saturatedInviter.Id, 0)

	CreditAffiliateCommission(saturatedTopUpUser.Id, 10*common.MaxAffQuotaReward)
	saturated := reloadAffiliateUser(t, saturatedInviter.Id)
	assert.Equal(t, common.MaxQuota, saturated.AffQuota)
	assert.Equal(t, saturated.AffQuota, saturated.AffHistoryQuota)

	// 已饱和的邀请人继续返佣不再累加，余额不回绕
	CreditAffiliateCommission(saturatedTopUpUser.Id, 10*common.MaxAffQuotaReward)
	again := reloadAffiliateUser(t, saturatedInviter.Id)
	assert.Positive(t, again.AffQuota)
	assert.Equal(t, common.MaxQuota, again.AffQuota)
}

func TestValidateOptionValueBoundsAffiliateSettings(t *testing.T) {
	tests := []struct {
		key     string
		value   string
		wantErr bool
	}{
		{key: "QuotaForInviter", value: "0"},
		{key: "QuotaForInviter", value: "1000"},
		{key: "QuotaForInvitee", value: strconv.Itoa(common.MaxAffQuotaReward)},
		{key: "QuotaForInviter", value: "-1", wantErr: true},
		{key: "QuotaForInvitee", value: strconv.Itoa(common.MaxAffQuotaReward + 1), wantErr: true},
		{key: "AffCommissionRate", value: "0"},
		{key: "AffCommissionRate", value: "0.2"},
		{key: "AffCommissionRate", value: "0.21", wantErr: true},
		{key: "AffCommissionRate", value: "-0.1", wantErr: true},
		{key: "AffCommissionRate", value: "NaN", wantErr: true},
		{key: "AffCommissionRate", value: "+Inf", wantErr: true},
		{key: "AffCommissionExpireDays", value: "0"},
		{key: "AffCommissionExpireDays", value: strconv.Itoa(common.MaxAffCommissionExpireDays)},
		{key: "AffCommissionExpireDays", value: strconv.Itoa(common.MaxAffCommissionExpireDays + 1), wantErr: true},
		{key: "AffCommissionExpireDays", value: "-1", wantErr: true},
	}
	for _, tc := range tests {
		t.Run(tc.key+"="+tc.value, func(t *testing.T) {
			err := validateOptionValue(tc.key, tc.value)
			if tc.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestEnsureAffCodeIsStableAndValid(t *testing.T) {
	resetAffiliateTables(t)

	user := createAffiliateUser(t, "", 0, 0)
	code, err := user.EnsureAffCode()
	require.NoError(t, err)
	require.Len(t, code, 6)
	assert.Equal(t, code, reloadAffiliateUser(t, user.Id).AffCode)

	// 重复调用不再生成新码
	again, err := user.EnsureAffCode()
	require.NoError(t, err)
	assert.Equal(t, code, again)

	other := createAffiliateUser(t, "", 0, 0)
	otherCode, err := other.EnsureAffCode()
	require.NoError(t, err)
	assert.NotEqual(t, code, otherCode)
}

func TestTransferAffQuotaToQuotaMovesBalance(t *testing.T) {
	resetAffiliateTables(t)

	unit := int(common.QuotaPerUnit)
	user := createAffiliateUser(t, "transfer-user", 0, 0)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", user.Id).Update("aff_quota", 2*unit).Error)

	require.Error(t, user.TransferAffQuotaToQuota(unit-1), "低于最小转移额度应被拒绝")
	require.NoError(t, user.TransferAffQuotaToQuota(unit))

	reloaded := reloadAffiliateUser(t, user.Id)
	assert.Equal(t, unit, reloaded.Quota)
	assert.Equal(t, unit, reloaded.AffQuota)
}
