package service

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type imageJobRepeatedByte byte

func (value imageJobRepeatedByte) Read(destination []byte) (int, error) {
	for index := range destination {
		destination[index] = byte(value)
	}
	return len(destination), nil
}

func configureImageJobFetch(t *testing.T, allowPrivate bool) {
	t.Helper()
	setting := system_setting.GetFetchSetting()
	previousSetting := *setting
	previousClient := ssrfProtectedHTTPClient
	*setting = system_setting.FetchSetting{
		EnableSSRFProtection: true,
		AllowPrivateIp:       allowPrivate,
	}
	client := newProtectedFetchHTTPClientWithProxy(nil, nil, nil, func(*http.Request) (*url.URL, error) {
		return nil, nil
	})
	ssrfProtectedHTTPClient = client
	t.Cleanup(func() {
		client.CloseIdleConnections()
		ssrfProtectedHTTPClient = previousClient
		*setting = previousSetting
	})
}

func startImageJobRelay(t *testing.T, handler http.HandlerFunc) *model.ImageJob {
	t.Helper()
	t.Chdir(t.TempDir())
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	_, port, err := net.SplitHostPort(server.Listener.Addr().String())
	require.NoError(t, err)
	portNumber, err := strconv.Atoi(port)
	require.NoError(t, err)
	previousPort := *common.Port
	*common.Port = portNumber
	t.Cleanup(func() { *common.Port = previousPort })
	t.Setenv("PORT", "")
	return &model.ImageJob{Id: 7, Model: "test-image", Prompt: "a teal spiral", N: 1}
}

func TestImageJobRejectsBlockedImageURL(t *testing.T) {
	configureImageJobFetch(t, false)
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		_, _ = io.WriteString(w, "private image")
	}))
	t.Cleanup(server.Close)

	_, err := imageBytes(context.Background(), imageRelayItem{Url: server.URL})
	assert.Error(t, err)
	assert.Zero(t, requests.Load(), "a rejected private destination must never receive a request")
}

func TestImageJobImageByteLimit(t *testing.T) {
	configureImageJobFetch(t, true)
	const maximum = 32 << 20
	for _, testCase := range []struct {
		name string
		size int
	}{
		{name: "limit", size: maximum},
		{name: "oversized", size: maximum + 1},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				_, _ = io.CopyN(w, imageJobRepeatedByte('x'), int64(testCase.size))
			}))
			t.Cleanup(server.Close)
			t.Run("download", func(t *testing.T) {
				data, err := imageBytes(context.Background(), imageRelayItem{Url: server.URL})
				if testCase.size > maximum {
					assert.Error(t, err, "an oversized image must fail rather than save a truncated file")
				} else {
					require.NoError(t, err)
					assert.Len(t, data, testCase.size)
				}
			})
			t.Run("base64", func(t *testing.T) {
				encoded := base64.StdEncoding.EncodeToString([]byte(strings.Repeat("x", testCase.size)))
				data, err := imageBytes(context.Background(), imageRelayItem{B64Json: encoded})
				if testCase.size > maximum {
					assert.Error(t, err)
				} else {
					require.NoError(t, err)
					assert.Len(t, data, testCase.size)
				}
			})
		})
	}
}

func TestImageJobPortEnvironmentWins(t *testing.T) {
	job := startImageJobRelay(t, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/images/generations", r.URL.Path)
		_, _ = io.WriteString(w, `{"data":[{"b64_json":"b2s="}]}`)
	})
	t.Setenv("PORT", strconv.Itoa(*common.Port))
	*common.Port = 0

	paths, err := renderImageJob(job, "fixture-key")
	require.NoError(t, err)
	require.Len(t, paths, 1)
	data, err := os.ReadFile(ImageJobStoredPath(paths[0]))
	require.NoError(t, err)
	assert.Equal(t, "ok", string(data))
}

func TestImageJobRejectsOversizedRelayResponse(t *testing.T) {
	job := startImageJobRelay(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"data":[{"b64_json":"b2s="}]}`)
		_, _ = io.CopyN(w, imageJobRepeatedByte(' '), 64<<20)
	})

	_, err := renderImageJob(job, "fixture-key")
	assert.Error(t, err)
	_, statErr := os.Stat(ImageJobFilePath(job.Id, 0))
	assert.ErrorIs(t, statErr, os.ErrNotExist)
}

func TestImageJobRejectsExtraImages(t *testing.T) {
	job := startImageJobRelay(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"data":[{"b64_json":"b2s="},{"b64_json":"b2s="}]}`)
	})

	_, err := renderImageJob(job, "fixture-key")
	assert.Error(t, err)
	_, statErr := os.Stat(ImageJobFilePath(job.Id, 0))
	assert.ErrorIs(t, statErr, os.ErrNotExist)
}

func TestImageJobRemovesPartialFiles(t *testing.T) {
	job := startImageJobRelay(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"data":[{"b64_json":"b2s="},{"b64_json":"invalid base64"}]}`)
	})
	job.N = 2

	_, err := renderImageJob(job, "fixture-key")
	require.Error(t, err)
	_, statErr := os.Stat(ImageJobFilePath(job.Id, 0))
	assert.ErrorIs(t, statErr, os.ErrNotExist, "a later image failure must remove earlier files")
}

type imageJobRoundTripper func(*http.Request) (*http.Response, error)

func (roundTrip imageJobRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	return roundTrip(request)
}

type imageJobContextBody struct {
	ctx    context.Context
	cancel context.CancelFunc
	closed bool
}

func (body *imageJobContextBody) Read([]byte) (int, error) {
	body.cancel()
	<-body.ctx.Done()
	return 0, body.ctx.Err()
}

func (body *imageJobContextBody) Close() error {
	body.closed = true
	return nil
}

func TestImageJobDownloadPreservesProtectedClient(t *testing.T) {
	configureImageJobFetch(t, false)
	redirectRejected := errors.New("fixture redirect rejected")
	var requests, redirects int
	ssrfProtectedHTTPClient = &http.Client{
		Transport: imageJobRoundTripper(func(request *http.Request) (*http.Response, error) {
			requests++
			assert.Equal(t, "8.8.8.8", request.URL.Hostname())
			return &http.Response{
				StatusCode: http.StatusFound,
				Header:     http.Header{"Location": {"http://127.0.0.1/private"}},
				Body:       io.NopCloser(strings.NewReader("")),
				Request:    request,
			}, nil
		}),
		CheckRedirect: func(request *http.Request, via []*http.Request) error {
			redirects++
			require.Error(t, checkProtectedFetchRedirect(request, via))
			return redirectRejected
		},
	}

	_, err := imageBytes(context.Background(), imageRelayItem{Url: "http://8.8.8.8/image"})
	assert.ErrorIs(t, err, redirectRejected)
	assert.Equal(t, 1, requests)
	assert.Equal(t, 1, redirects)
}

func TestImageJobDownloadHonorsContext(t *testing.T) {
	for _, phase := range []string{"headers", "body"} {
		t.Run(phase, func(t *testing.T) {
			configureImageJobFetch(t, false)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			var body *imageJobContextBody
			ssrfProtectedHTTPClient = &http.Client{Transport: imageJobRoundTripper(func(request *http.Request) (*http.Response, error) {
				_, hasDeadline := request.Context().Deadline()
				assert.True(t, hasDeadline, "the complete download must have a deadline")
				if phase == "headers" {
					cancel()
					<-request.Context().Done()
					return nil, request.Context().Err()
				}
				body = &imageJobContextBody{ctx: request.Context(), cancel: cancel}
				return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: body}, nil
			})}

			_, err := imageBytes(ctx, imageRelayItem{Url: "http://8.8.8.8/image"})
			assert.ErrorIs(t, err, context.Canceled)
			if body != nil {
				assert.True(t, body.closed)
			}
		})
	}
}

func TestImageJobDownloadFailsClosedWithoutClient(t *testing.T) {
	configureImageJobFetch(t, true)
	ssrfProtectedHTTPClient = nil
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		_, _ = io.WriteString(w, "image")
	}))
	t.Cleanup(server.Close)

	_, err := imageBytes(context.Background(), imageRelayItem{Url: server.URL})
	assert.Error(t, err)
	assert.Zero(t, requests.Load())
}

func TestImageJobReservations(t *testing.T) {
	var firstUserRelease func()
	for range 4 {
		release, ok := TryReserveImageJob(1)
		require.True(t, ok)
		t.Cleanup(release)
		firstUserRelease = release
	}
	_, ok := TryReserveImageJob(1)
	assert.False(t, ok, "a user's fifth unfinished job must be rejected")
	otherUserRelease, ok := TryReserveImageJob(2)
	require.True(t, ok, "one user's queue must leave room for another user")
	t.Cleanup(otherUserRelease)

	firstUserRelease()
	firstUserRelease()
	release, ok := TryReserveImageJob(1)
	require.True(t, ok)
	t.Cleanup(release)
	_, ok = TryReserveImageJob(1)
	assert.False(t, ok, "releasing twice must only restore one slot")

	for index := range 27 {
		release, ok := TryReserveImageJob(100 + index/4)
		require.True(t, ok)
		t.Cleanup(release)
	}
	_, ok = TryReserveImageJob(999)
	assert.False(t, ok, "the thirty-third unfinished job must be rejected")
	otherUserRelease()
	otherUserRelease()
	release, ok = TryReserveImageJob(999)
	require.True(t, ok)
	t.Cleanup(release)
	_, ok = TryReserveImageJob(1000)
	assert.False(t, ok, "idempotent release must preserve the global capacity")
}

func TestImageJobConcurrentReservations(t *testing.T) {
	start := make(chan struct{})
	results := make(chan func(), 8)
	var workers sync.WaitGroup
	for range 8 {
		workers.Go(func() {
			<-start
			if release, ok := TryReserveImageJob(2000); ok {
				results <- release
			}
		})
	}
	close(start)
	workers.Wait()
	close(results)
	var releases []func()
	for release := range results {
		releases = append(releases, release)
		t.Cleanup(release)
	}
	require.Len(t, releases, 4)
	for _, release := range releases {
		for range 2 {
			workers.Go(release)
		}
	}
	workers.Wait()
	for range 4 {
		release, ok := TryReserveImageJob(2000)
		require.True(t, ok)
		t.Cleanup(release)
	}
	_, ok := TryReserveImageJob(2000)
	assert.False(t, ok)
}

func TestImageJobRedactsRelayErrors(t *testing.T) {
	const key = "fixture-private-key"
	job := startImageJobRelay(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{"error":{"message":"invalid key `+key+`"}}`)
	})

	_, err := renderImageJob(job, key)
	require.Error(t, err)
	assert.NotContains(t, err.Error(), key)
}
