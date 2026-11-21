package controller

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestImageJobImageDoesNotCacheMutableIndexes(t *testing.T) {
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	previousRedis := common.RedisEnabled
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		common.RedisEnabled = previousRedis
	})
	db := setupTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.ImageJob{}))
	t.Chdir(t.TempDir())
	job := &model.ImageJob{UserId: 7, Model: "image", N: 1, Status: model.ImageJobSucceeded}
	require.NoError(t, model.CreateImageJob(job))
	name := model.ImageJobFileName(job.Id, 0)
	paths, err := common.Marshal([]string{name})
	require.NoError(t, err)
	require.NoError(t, model.UpdateImageJob(job.Id, map[string]any{"image_paths": string(paths)}))
	filePath := service.ImageJobStoredPath(name)
	require.NoError(t, os.MkdirAll(filepath.Dir(filePath), 0o700))
	require.NoError(t, os.WriteFile(filePath, []byte("rendered-image"), 0o600))
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("id", 7); c.Next() })
	router.GET("/image-jobs/:id/images/:index", GetImageJobImage)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/image-jobs/1/images/0", nil))
	require.Equal(t, http.StatusOK, response.Code)
	assert.Equal(t, "private, no-store", response.Header().Get("Cache-Control"))
	assert.Equal(t, "nosniff", response.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, "rendered-image", response.Body.String())
}

func TestCreateImageJobRejectsFullQueueWithoutPersistingJob(t *testing.T) {
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	previousRedis := common.RedisEnabled
	originalStudio, originalImage := common.StudioEnabled, common.StudioImageEnabled
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		common.RedisEnabled = previousRedis
		common.StudioEnabled, common.StudioImageEnabled = originalStudio, originalImage
	})
	common.StudioEnabled, common.StudioImageEnabled = true, true
	db := setupTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.ImageJob{}))
	token := &model.Token{UserId: 7, Key: "queue-test-key"}
	require.NoError(t, db.Create(token).Error)
	for range 4 {
		release, ok := service.TryReserveImageJob(7)
		require.True(t, ok)
		t.Cleanup(release)
	}
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("id", 7); c.Next() })
	router.POST("/image-jobs", CreateImageJob)
	requestBody, err := common.Marshal(imageJobRequest{TokenId: token.Id, Model: strings.Repeat("m", 128), Prompt: strings.Repeat("p", (64<<10)-1), Size: strings.Repeat("s", 32), N: 1})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/image-jobs", strings.NewReader(string(requestBody)))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	assert.Equal(t, http.StatusTooManyRequests, response.Code)
	assert.Equal(t, "10", response.Header().Get("Retry-After"))
	var count int64
	require.NoError(t, db.Model(&model.ImageJob{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestCreateImageJobHonorsStudioSwitchesBeforeReadingInput(t *testing.T) {
	originalStudio, originalImage := common.StudioEnabled, common.StudioImageEnabled
	t.Cleanup(func() { common.StudioEnabled, common.StudioImageEnabled = originalStudio, originalImage })
	for _, tc := range []struct {
		name          string
		studio, image bool
	}{
		{name: "studio disabled", studio: false, image: true},
		{name: "image disabled", studio: true, image: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			common.StudioEnabled, common.StudioImageEnabled = tc.studio, tc.image
			router := gin.New()
			router.POST("/image-jobs", CreateImageJob)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/image-jobs", strings.NewReader("{}")))
			assert.Equal(t, http.StatusForbidden, response.Code)
			assert.Contains(t, response.Body.String(), `"success":false`)
		})
	}
}

func TestCreateImageJobRejectsOversizedBodiesBeforeTokenLookup(t *testing.T) {
	originalStudio, originalImage := common.StudioEnabled, common.StudioImageEnabled
	common.StudioEnabled, common.StudioImageEnabled = true, true
	t.Cleanup(func() { common.StudioEnabled, common.StudioImageEnabled = originalStudio, originalImage })
	for _, chunked := range []bool{false, true} {
		name := "content length"
		if chunked {
			name = "chunked"
		}
		t.Run(name, func(t *testing.T) {
			body := `{"prompt":"` + strings.Repeat("x", 1<<20) + `"}`
			request := httptest.NewRequest(http.MethodPost, "/image-jobs", strings.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			if chunked {
				request.ContentLength = -1
				request.TransferEncoding = []string{"chunked"}
			}
			response := httptest.NewRecorder()
			router := gin.New()
			router.POST("/image-jobs", CreateImageJob)
			router.ServeHTTP(response, request)
			assert.Equal(t, http.StatusRequestEntityTooLarge, response.Code)
			assert.Contains(t, response.Body.String(), `"success":false`)
		})
	}
}

func TestCreateImageJobRejectsInvalidTextBeforeTokenLookup(t *testing.T) {
	originalStudio, originalImage := common.StudioEnabled, common.StudioImageEnabled
	common.StudioEnabled, common.StudioImageEnabled = true, true
	t.Cleanup(func() { common.StudioEnabled, common.StudioImageEnabled = originalStudio, originalImage })
	for _, tc := range []struct{ name, body string }{
		{name: "blank model", body: `{"model":"   ","prompt":"draw","n":1}`},
		{name: "blank prompt", body: `{"model":"image","prompt":" \t ","n":1}`},
		{name: "long model", body: `{"model":"` + strings.Repeat("m", 129) + `","prompt":"draw","n":1}`},
		{name: "long size", body: `{"model":"image","prompt":"draw","n":1,"size":"` + strings.Repeat("s", 33) + `"}`},
		{name: "long prompt", body: `{"model":"image","prompt":"` + strings.Repeat("p", 64<<10) + `","n":1}`},
		{name: "zero count", body: `{"model":"image","prompt":"draw","n":0}`},
		{name: "excessive count", body: `{"model":"image","prompt":"draw","n":11}`},
		{name: "malformed json", body: `{"model":`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			router := gin.New()
			router.Use(gin.Recovery())
			router.POST("/image-jobs", CreateImageJob)
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/image-jobs", strings.NewReader(tc.body))
			request.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(response, request)
			require.Equal(t, http.StatusBadRequest, response.Code)
			assert.Contains(t, response.Body.String(), `"success":false`)
		})
	}
}
