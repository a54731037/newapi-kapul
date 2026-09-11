package model

import (
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// InviteIPLog 记录邀请注册时的 IP，用于 24 小时内同 IP 防刷。
type InviteIPLog struct {
	Id        int    `json:"id" gorm:"primaryKey;autoIncrement"`
	IP        string `json:"ip" gorm:"type:varchar(64);index"`
	InviterId int    `json:"inviter_id" gorm:"index"`
	CreatedAt int64  `json:"created_at" gorm:"autoCreateTime"`
}

// IsInviteIPDuplicate 检查 24 小时内同一 IP 是否已经触发过邀请奖励。
// 返回 true 表示重复，应跳过本次邀请奖励。
func IsInviteIPDuplicate(tx *gorm.DB, ip string, inviterId int) bool {
	if ip == "" {
		return false
	}
	cutoff := time.Now().Add(-24 * time.Hour).Unix()
	var count int64
	err := tx.Model(&InviteIPLog{}).
		Where("ip = ? AND inviter_id = ? AND created_at > ?", ip, inviterId, cutoff).
		Count(&count).Error
	if err != nil {
		return false // 查询失败不阻塞注册
	}
	return count > 0
}

// claimInviteRewardSlot 以 (IP, 邀请人) 为键占用一次邀请奖励名额：
// 24 小时内已有记录时返回 false（本次不发奖），否则先写入记录再返回 true。
// 名额在发奖前写入并锁定邀请人行，避免并发注册在同一 IP 上重复发奖
// （SQLite 没有 FOR UPDATE，仍可能并发通过，实际部署中多实例场景为 MySQL/PostgreSQL）。
func claimInviteRewardSlot(inviterId int, ip string) bool {
	if ip == "" || inviterId == 0 {
		return false
	}
	claimed := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		var inviter User
		if err := lockForUpdate(tx).Select("id").First(&inviter, inviterId).Error; err != nil {
			return err
		}
		if IsInviteIPDuplicate(tx, ip, inviterId) {
			return nil
		}
		claimed = true
		return tx.Create(&InviteIPLog{IP: ip, InviterId: inviterId}).Error
	})
	if err != nil {
		common.SysError(fmt.Sprintf("failed to claim invite reward slot for inviter %d: %s", inviterId, err.Error()))
		return false
	}
	return claimed
}
