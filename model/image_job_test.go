package model

import (
	"strconv"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"github.com/QuantumNous/new-api/common"
)

func setupImageJobDB(t *testing.T) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&ImageJob{}))
	previous := DB
	DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		DB = previous
	})
}

func TestImageJobOwnershipAndImages(t *testing.T) {
	setupImageJobDB(t)

	job := &ImageJob{
		UserId:     7,
		TokenId:    3,
		Model:      "gpt-image-2.5",
		Prompt:     "a teal spiral",
		Size:       "512x512",
		N:          1,
		ImagePaths: `["7-0.png","7-1.png"]`,
	}
	require.NoError(t, CreateImageJob(job))
	require.NotZero(t, job.Id)

	images := job.Images()
	require.Len(t, images, 2)
	assert.Equal(t, "/api/creative/image-jobs/"+strconv.Itoa(job.Id)+"/images/0", images[0].Url)

	_, err := GetImageJobById(job.Id, 8)
	require.Error(t, err, "another account must not read the job")

	owned, err := GetImageJobById(job.Id, 7)
	require.NoError(t, err)
	assert.Equal(t, ImageJobPending, owned.Status)
}

func TestFailInterruptedImageJobsClosesPendingOnes(t *testing.T) {
	setupImageJobDB(t)

	pending := &ImageJob{UserId: 1, TokenId: 1, Model: "m", Prompt: "p", N: 1}
	require.NoError(t, CreateImageJob(pending))
	running := &ImageJob{UserId: 1, TokenId: 1, Model: "m", Prompt: "p", N: 1, Status: ImageJobRunning}
	require.NoError(t, CreateImageJob(running))

	FailInterruptedImageJobs()

	for _, id := range []int{pending.Id, running.Id} {
		job, err := GetImageJob(id)
		require.NoError(t, err)
		assert.Equal(t, ImageJobFailed, job.Status)
		assert.NotEmpty(t, job.Error)
	}
}

func TestListImageJobsIsScopedToTheAccount(t *testing.T) {
	setupImageJobDB(t)

	require.NoError(t, CreateImageJob(&ImageJob{UserId: 1, TokenId: 1, Model: "m", Prompt: "a", N: 1}))
	require.NoError(t, CreateImageJob(&ImageJob{UserId: 2, TokenId: 2, Model: "m", Prompt: "b", N: 1}))

	jobs, err := ListImageJobs(1, 10)
	require.NoError(t, err)
	require.Len(t, jobs, 1)
	assert.Equal(t, "a", jobs[0].Prompt)
}

func TestDeletingOneImageKeepsTheRest(t *testing.T) {
	setupImageJobDB(t)

	job := &ImageJob{UserId: 4, TokenId: 1, Model: "m", Prompt: "p", N: 2, Status: ImageJobSucceeded}
	require.NoError(t, CreateImageJob(job))
	require.NoError(t, SetImageJobPaths(job.Id, []string{"9-0.png", "9-1.png"}))

	loaded, err := GetImageJob(job.Id)
	require.NoError(t, err)
	paths := loaded.ImagePathList()
	require.Len(t, paths, 2)
	// Drop the first file the way the delete handler does.
	require.NoError(t, SetImageJobPaths(job.Id, paths[1:]))

	loaded, err = GetImageJob(job.Id)
	require.NoError(t, err)
	assert.Equal(t, []string{"9-1.png"}, loaded.ImagePathList())
	assert.Len(t, loaded.Images(), 1, "one rendered file must survive")

	require.NoError(t, DeleteImageJobRecord(job.Id, 4))
	_, err = GetImageJob(job.Id)
	require.Error(t, err)
}
