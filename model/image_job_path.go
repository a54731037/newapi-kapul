package model

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
)

// ImageJobFileName is the on-disk name of one rendered image.
func ImageJobFileName(id int, index int) string {
	return fmt.Sprintf("%d-%d.png", id, index)
}

func imageJobImageUrl(id int, index int) string {
	return fmt.Sprintf("/api/creative/image-jobs/%d/images/%d", id, index)
}

// GetImageJob loads a job without an owner filter; the runner needs it too.
func GetImageJob(id int) (*ImageJob, error) {
	var job ImageJob
	if err := DB.First(&job, id).Error; err != nil {
		return nil, err
	}
	return &job, nil
}

// SetImageJobPaths rewrites the rendered files of a job.
func SetImageJobPaths(id int, paths []string) error {
	encoded, err := common.Marshal(paths)
	if err != nil {
		return err
	}
	return UpdateImageJob(id, map[string]any{"image_paths": string(encoded)})
}

// DeleteImageJobRecord removes one job row.
func DeleteImageJobRecord(id int, userId int) error {
	result := DB.Where("id = ? AND user_id = ?", id, userId).Delete(&ImageJob{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrImageJobNotFound
	}
	return nil
}

// FailInterruptedImageJobs closes jobs that a process restart orphaned.
func FailInterruptedImageJobs() {
	jobs, err := UnfinishedImageJobs()
	if err != nil {
		return
	}
	for index := range jobs {
		job := jobs[index]
		_ = UpdateImageJob(job.Id, map[string]any{
			"status": ImageJobFailed,
			"error":  "the server restarted before this image finished",
		})
	}
}
