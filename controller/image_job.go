package controller

import (
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
)

type imageJobRequest struct {
	TokenId int    `json:"token_id"`
	Model   string `json:"model"`
	Prompt  string `json:"prompt"`
	Size    string `json:"size"`
	N       int    `json:"n"`
}

// CreateImageJob starts a generation owned by the server, so a page reload no
// longer cancels the request.
func CreateImageJob(c *gin.Context) {
	if !common.StudioEnabled || !common.StudioImageEnabled {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "image generation is disabled"})
		return
	}
	// This endpoint accepts text parameters only. Bound both known-length and
	// chunked bodies before the JSON decoder allocates or any job is persisted.
	const maxImageJobRequestBytes = 1 << 20
	if c.Request.ContentLength > maxImageJobRequestBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"success": false, "message": "image job request is too large"})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxImageJobRequestBytes)
	userId := c.GetInt("id")
	var request imageJobRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		var sizeError *http.MaxBytesError
		if errors.As(err, &sizeError) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"success": false, "message": "image job request is too large"})
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid image job request"})
		}
		return
	}
	if strings.TrimSpace(request.Model) == "" || len(request.Model) > 128 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "model is required and must be at most 128 bytes"})
		return
	}
	if strings.TrimSpace(request.Prompt) == "" || len(request.Prompt) > (64<<10)-1 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "prompt is required and must be at most 65535 bytes"})
		return
	}
	if len(request.Size) > 32 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "size must be at most 32 bytes"})
		return
	}
	if request.N < 1 || request.N > 10 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "n must be between 1 and 10"})
		return
	}
	if _, err := model.GetTokenByIds(request.TokenId, userId); err != nil {
		common.ApiErrorMsg(c, "the API key does not belong to this account")
		return
	}

	release, ok := service.TryReserveImageJob(userId)
	if !ok {
		c.Header("Retry-After", "10")
		c.JSON(http.StatusTooManyRequests, gin.H{"success": false, "message": "the image job queue is full; please try again later"})
		return
	}
	job := &model.ImageJob{
		UserId:  userId,
		TokenId: request.TokenId,
		Model:   request.Model,
		Prompt:  request.Prompt,
		Size:    request.Size,
		N:       request.N,
		Status:  model.ImageJobPending,
	}
	if err := model.CreateImageJob(job); err != nil {
		release()
		common.ApiError(c, err)
		return
	}
	service.EnqueueImageJob(job.Id, release)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    imageJobPayload(job),
	})
}

// GetImageJob returns one job with its rendered files.
func GetImageJob(c *gin.Context) {
	userId := c.GetInt("id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	job, err := model.GetImageJobById(id, userId)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "job not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": imageJobPayload(job)})
}

// ListImageJobs returns the caller's recent jobs, newest first.
func ListImageJobs(c *gin.Context) {
	userId := c.GetInt("id")
	limit, _ := strconv.Atoi(c.Query("limit"))
	jobs, err := model.ListImageJobs(userId, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	items := make([]gin.H, 0, len(jobs))
	for index := range jobs {
		items = append(items, imageJobPayload(&jobs[index]))
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": items})
}

// GetImageJobImage streams one rendered file.
func GetImageJobImage(c *gin.Context) {
	userId := c.GetInt("id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	index, err := strconv.Atoi(c.Param("index"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	job, err := model.GetImageJobById(id, userId)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	paths := job.ImagePathList()
	if index < 0 || index >= len(paths) {
		c.Status(http.StatusNotFound)
		return
	}
	data, err := os.ReadFile(service.ImageJobStoredPath(paths[index]))
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	// Deleting an earlier image shifts these indexes; a cached response would
	// otherwise keep showing the deleted image and skip the ownership check.
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, "image/png", data)
}

// DeleteImageJobImage removes one rendered file and keeps the rest.
func DeleteImageJobImage(c *gin.Context) {
	userId := c.GetInt("id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	index, err := strconv.Atoi(c.Param("index"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	job, err := model.GetImageJobById(id, userId)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "job not found"})
		return
	}
	paths := job.ImagePathList()
	if index < 0 || index >= len(paths) {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "image not found"})
		return
	}
	removed := paths[index]
	service.RemoveImageJobFiles([]string{removed})
	remaining := append(append([]string{}, paths[:index]...), paths[index+1:]...)
	if len(remaining) == 0 {
		// Nothing left to keep: drop the record so an empty card never lingers.
		if err := model.DeleteImageJobRecord(id, userId); err != nil {
			common.ApiError(c, err)
			return
		}
	} else if err := model.SetImageJobPaths(id, remaining); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}

// DeleteImageJob removes a job with every rendered file.
func DeleteImageJob(c *gin.Context) {
	userId := c.GetInt("id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	job, err := model.GetImageJobById(id, userId)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "job not found"})
		return
	}
	if job.Status == model.ImageJobRunning || job.Status == model.ImageJobPending {
		c.JSON(http.StatusConflict, gin.H{
			"success": false,
			"message": "the image is still being generated",
		})
		return
	}
	service.RemoveImageJobFiles(job.ImagePathList())
	if err := model.DeleteImageJobRecord(id, userId); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}

func imageJobPayload(job *model.ImageJob) gin.H {
	return gin.H{
		"id":         job.Id,
		"model":      job.Model,
		"prompt":     job.Prompt,
		"size":       job.Size,
		"n":          job.N,
		"status":     job.Status,
		"error":      job.Error,
		"images":     job.Images(),
		"created_at": job.CreatedAt,
	}
}
