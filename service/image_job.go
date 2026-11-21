package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
)

const (
	imageJobDir              = "data/image-jobs"
	imageJobTimeout          = 10 * time.Minute
	imageJobMaxImageBytes    = 32 << 20
	imageJobMaxResponseBytes = 64 << 20
)

var imageJobReservations = struct {
	sync.Mutex
	total int
	users map[int]int
}{users: make(map[int]int)}

// TryReserveImageJob bounds both queued and active jobs before they are stored.
// The returned release must be called if creation fails, or passed to EnqueueImageJob.
func TryReserveImageJob(userID int) (release func(), ok bool) {
	imageJobReservations.Lock()
	defer imageJobReservations.Unlock()
	if userID <= 0 || imageJobReservations.total >= 32 || imageJobReservations.users[userID] >= 4 {
		return nil, false
	}
	imageJobReservations.total++
	imageJobReservations.users[userID]++
	var once sync.Once
	return func() {
		once.Do(func() {
			imageJobReservations.Lock()
			defer imageJobReservations.Unlock()
			imageJobReservations.total--
			imageJobReservations.users[userID]--
			if imageJobReservations.users[userID] == 0 {
				delete(imageJobReservations.users, userID)
			}
		})
	}, true
}

type imageRelayItem struct {
	B64Json string `json:"b64_json"`
	Url     string `json:"url"`
}

type imageRelayResponse struct {
	Data []imageRelayItem `json:"data"`
}

// imageJobSlots bounds how many generations run at once so a burst of reloads
// cannot exhaust upstream concurrency.
var imageJobSlots = make(chan struct{}, 3)

// EnqueueImageJob renders one job in the background. The request lives in the
// server process, so closing or reloading the page cannot cancel it.
func EnqueueImageJob(jobId int, release func()) {
	if release == nil {
		return
	}
	go func() {
		defer release()
		imageJobSlots <- struct{}{}
		defer func() { <-imageJobSlots }()
		runImageJob(jobId)
	}()
}

func imageJobBaseDir() string {
	return imageJobDir
}

func runImageJob(jobId int) {
	job, err := model.GetImageJob(jobId)
	if err != nil {
		logger.LogWarn(nil, fmt.Sprintf("image job %d disappeared: %v", jobId, err))
		return
	}
	token, err := model.GetTokenById(job.TokenId)
	if err != nil {
		failImageJob(jobId, "the API key used for this job is gone")
		return
	}
	if err := model.UpdateImageJob(jobId, map[string]any{"status": model.ImageJobRunning}); err != nil {
		logger.LogWarn(nil, fmt.Sprintf("image job %d cannot start: %v", jobId, err))
		return
	}

	paths, err := renderImageJob(job, token.Key)
	if err != nil {
		failImageJob(jobId, err.Error())
		return
	}
	encoded, err := common.Marshal(paths)
	if err != nil {
		failImageJob(jobId, "cannot record the rendered files")
		return
	}
	if err := model.UpdateImageJob(jobId, map[string]any{
		"status":      model.ImageJobSucceeded,
		"image_paths": string(encoded),
	}); err != nil {
		logger.LogWarn(nil, fmt.Sprintf("image job %d cannot finish: %v", jobId, err))
	}
}

func failImageJob(jobId int, message string) {
	if err := model.UpdateImageJob(jobId, map[string]any{
		"status": model.ImageJobFailed,
		"error":  message,
	}); err != nil {
		logger.LogWarn(nil, fmt.Sprintf("image job %d cannot fail: %v", jobId, err))
	}
}

func renderImageJob(job *model.ImageJob, key string) (paths []string, err error) {
	ctx, cancel := context.WithTimeout(context.Background(), imageJobTimeout)
	defer cancel()
	var writtenPaths []string
	defer func() {
		if err != nil {
			RemoveImageJobFiles(writtenPaths)
			if key != "" {
				err = errors.New(strings.ReplaceAll(err.Error(), key, "[redacted]"))
			}
		}
	}()
	requestBody, err := common.Marshal(map[string]any{
		"model":           job.Model,
		"prompt":          job.Prompt,
		"size":            job.Size,
		"n":               job.N,
		"response_format": "b64_json",
	})
	if err != nil {
		return nil, err
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = strconv.Itoa(*common.Port)
	}
	url := fmt.Sprintf("http://127.0.0.1:%s/v1/images/generations", port)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(requestBody))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+key)

	client := &http.Client{Timeout: imageJobTimeout}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, imageJobMaxResponseBytes+1))
	if err != nil {
		return nil, err
	}
	if len(body) > imageJobMaxResponseBytes {
		return nil, errors.New("the image generation response exceeds 64 MiB")
	}
	if response.StatusCode != http.StatusOK {
		// Keep the model and status visible: the upstream message alone is often
		// just "Upstream request failed" and gives no way to act on it.
		return nil, fmt.Errorf(
			"%s (%s, HTTP %d)",
			relayErrorMessage(body, response.StatusCode),
			job.Model,
			response.StatusCode,
		)
	}

	var payload imageRelayResponse
	if err := common.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	if len(payload.Data) == 0 {
		return nil, errors.New("the upstream returned no image")
	}
	if len(payload.Data) > job.N {
		return nil, errors.New("the upstream returned more images than requested")
	}

	if err := os.MkdirAll(imageJobBaseDir(), 0o755); err != nil {
		return nil, err
	}
	paths = make([]string, 0, len(payload.Data))
	for index, item := range payload.Data {
		data, err := imageBytes(ctx, item)
		if err != nil {
			return nil, err
		}
		name := model.ImageJobFileName(job.Id, index)
		writtenPaths = append(writtenPaths, name)
		if err := os.WriteFile(filepath.Join(imageJobBaseDir(), name), data, 0o644); err != nil {
			return nil, err
		}
		paths = append(paths, name)
	}
	return paths, nil
}

func imageBytes(ctx context.Context, item imageRelayItem) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, imageJobTimeout)
	defer cancel()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if item.B64Json != "" {
		if len(item.B64Json) > base64.StdEncoding.EncodedLen(imageJobMaxImageBytes) {
			return nil, errors.New("the rendered image exceeds 32 MiB")
		}
		data, err := base64.StdEncoding.DecodeString(item.B64Json)
		if err != nil {
			return nil, err
		}
		if len(data) > imageJobMaxImageBytes {
			return nil, errors.New("the rendered image exceeds 32 MiB")
		}
		return data, nil
	}
	if item.Url == "" {
		return nil, errors.New("the upstream returned an empty image")
	}
	if err := ValidateSSRFProtectedFetchURL(item.Url); err != nil {
		return nil, err
	}
	baseClient := GetSSRFProtectedHTTPClient()
	if baseClient == nil || baseClient.Transport == nil {
		return nil, errors.New("the image download client is unavailable")
	}
	client := *baseClient
	if client.Timeout <= 0 || client.Timeout > imageJobTimeout {
		client.Timeout = imageJobTimeout
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, item.Url, nil)
	if err != nil {
		return nil, err
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("cannot download the rendered image: %s", response.Status)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, imageJobMaxImageBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > imageJobMaxImageBytes {
		return nil, errors.New("the rendered image exceeds 32 MiB")
	}
	return data, nil
}

func relayErrorMessage(body []byte, status int) string {
	var payload struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
		Message string `json:"message"`
	}
	if err := common.Unmarshal(body, &payload); err == nil {
		if payload.Error.Message != "" {
			return payload.Error.Message
		}
		if payload.Message != "" {
			return payload.Message
		}
	}
	text := string(body)
	if len(text) > 240 {
		text = text[:240]
	}
	if text == "" {
		return fmt.Sprintf("image generation failed with status %d", status)
	}
	return text
}

// RecoverInterruptedImageJobs closes jobs orphaned by a process restart, so the
// task list never shows a spinner that can no longer finish.
func RecoverInterruptedImageJobs() {
	model.FailInterruptedImageJobs()
}

// ImageJobFilePath resolves the on-disk path of one rendered file.
func ImageJobFilePath(jobId int, index int) string {
	return filepath.Join(imageJobBaseDir(), model.ImageJobFileName(jobId, index))
}

// ImageJobStoredPath resolves a stored file name.
func ImageJobStoredPath(name string) string {
	return filepath.Join(imageJobBaseDir(), filepath.Base(name))
}

// RemoveImageJobFiles removes every rendered file of a job.
func RemoveImageJobFiles(paths []string) {
	for _, name := range paths {
		_ = os.Remove(ImageJobStoredPath(name))
	}
}
