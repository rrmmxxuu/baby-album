package httpapi

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"io"
	"path/filepath"
	"strings"

	"babyalbum/api/internal/blob"

	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
)

func (s *Server) saveAvatar(babyID, originalName string, file io.Reader) (blob.SavedBlob, error) {
	data, err := io.ReadAll(io.LimitReader(file, s.maxUploadBytes))
	if err != nil {
		return blob.SavedBlob{}, err
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return blob.SavedBlob{}, err
	}
	resized := resizeAvatar(src, 320)
	canvas := image.NewRGBA(resized.Bounds())
	draw.Draw(canvas, canvas.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
	draw.Draw(canvas, canvas.Bounds(), resized, resized.Bounds().Min, draw.Over)
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, canvas, &jpeg.Options{Quality: 82}); err != nil {
		return blob.SavedBlob{}, err
	}
	return s.blob.SaveBytes(babyID+"-avatar", strings.TrimSuffix(originalName, filepath.Ext(originalName))+".jpg", encoded.Bytes())
}

func resizeAvatar(src image.Image, maxEdge int) image.Image {
	bounds := src.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= 0 || height <= 0 {
		return src
	}
	if width <= maxEdge && height <= maxEdge {
		return src
	}
	scale := float64(maxEdge) / float64(width)
	if height > width {
		scale = float64(maxEdge) / float64(height)
	}
	targetWidth := maxInt(1, int(float64(width)*scale))
	targetHeight := maxInt(1, int(float64(height)*scale))
	dst := image.NewRGBA(image.Rect(0, 0, targetWidth, targetHeight))
	for y := 0; y < targetHeight; y++ {
		sourceY := bounds.Min.Y + y*height/targetHeight
		for x := 0; x < targetWidth; x++ {
			sourceX := bounds.Min.X + x*width/targetWidth
			dst.Set(x, y, src.At(sourceX, sourceY))
		}
	}
	return dst
}

func maxInt(left, right int) int {
	if left > right {
		return left
	}
	return right
}
