package model

import (
	"errors"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// ImageJobStatus tracks a server-side image generation so it survives a browser
// reload: the request is owned by the server, not by the page.
const (
	ImageJobPending   = "pending"
	ImageJobRunning   = "running"
	ImageJobSucceeded = "succeeded"
	ImageJobFailed    = "failed"
)

// ImageJob stores one image generation request and its rendered files.
type ImageJob struct {
	Id         int    `json:"id" gorm:"primaryKey"`
	UserId     int    `json:"user_id" gorm:"index"`
	TokenId    int    `json:"token_id" gorm:"index"`
	Model      string `json:"model" gorm:"type:varchar(128);index"`
	Prompt     string `json:"prompt" gorm:"type:text"`
	Size       string `json:"size" gorm:"type:varchar(32)"`
	N          int    `json:"n"`
	Status     string `json:"status" gorm:"type:varchar(16);index"`
	Error      string `json:"error" gorm:"type:text"`
	ImagePaths string `json:"-" gorm:"type:text"`
	CreatedAt  int64  `json:"created_at" gorm:"bigint;index"`
	UpdatedAt  int64  `json:"updated_at" gorm:"bigint"`
}

// ImageJobImage is the public shape of one rendered file.
type ImageJobImage struct {
	Index int    `json:"index"`
	Url   string `json:"url"`
}

// ImagePathList returns the stored file names in render order.
func (job *ImageJob) ImagePathList() []string {
	if job.ImagePaths == "" {
		return nil
	}
	var paths []string
	if err := common.UnmarshalJsonStr(job.ImagePaths, &paths); err != nil {
		return nil
	}
	return paths
}

func (job *ImageJob) Images() []ImageJobImage {
	paths := job.ImagePathList()
	images := make([]ImageJobImage, 0, len(paths))
	for index := range paths {
		images = append(images, ImageJobImage{
			Index: index,
			Url:   imageJobImageUrl(job.Id, index),
		})
	}
	return images
}

// FileName returns the stored file name for one rendered image.
func (job *ImageJob) FileName(index int) string {
	return ImageJobFileName(job.Id, index)
}

func CreateImageJob(job *ImageJob) error {
	now := time.Now().Unix()
	job.CreatedAt = now
	job.UpdatedAt = now
	if job.Status == "" {
		job.Status = ImageJobPending
	}
	return DB.Create(job).Error
}

func GetImageJobById(id int, userId int) (*ImageJob, error) {
	var job ImageJob
	err := DB.Where("id = ? AND user_id = ?", id, userId).First(&job).Error
	if err != nil {
		return nil, err
	}
	return &job, nil
}

func ListImageJobs(userId int, limit int) ([]ImageJob, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	var jobs []ImageJob
	err := DB.Where("user_id = ?", userId).
		Order("id desc").
		Limit(limit).
		Find(&jobs).Error
	return jobs, err
}

func UpdateImageJob(id int, fields map[string]any) error {
	fields["updated_at"] = time.Now().Unix()
	return DB.Model(&ImageJob{}).Where("id = ?", id).Updates(fields).Error
}

// UnfinishedImageJobs returns jobs that were interrupted by a restart so the
// runner can mark them failed instead of leaving them pending forever.
func UnfinishedImageJobs() ([]ImageJob, error) {
	var jobs []ImageJob
	err := DB.Where("status IN ?", []string{ImageJobPending, ImageJobRunning}).
		Find(&jobs).Error
	return jobs, err
}

var ErrImageJobNotFound = errors.New("image job not found")
