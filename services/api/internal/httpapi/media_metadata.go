package httpapi

import (
	"encoding/binary"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type uploadedMediaMetadata struct {
	DetectedMediaType     string
	DetectedCapturedAtRaw string
}

func inspectUploadedMedia(sourcePath, originalName, clientMediaType string) uploadedMediaMetadata {
	detectedMediaType := detectStoredMediaType(sourcePath, originalName)
	_ = clientMediaType
	return uploadedMediaMetadata{
		DetectedMediaType:     detectedMediaType,
		DetectedCapturedAtRaw: detectStoredCapturedAtRaw(sourcePath, detectedMediaType, originalName),
	}
}

func detectStoredMediaType(sourcePath, originalName string) string {
	detected := normalizedMediaType(detectMediaTypeFromFile(sourcePath))
	extType := normalizedMediaType(mediaTypeForFileExtension(originalName))

	switch {
	case trustedMediaType(detected) && extType != "" && !sameMediaFamily(detected, extType):
		return detected
	case trustedMediaType(detected):
		return detected
	case extType != "" && preferExtensionMediaType(extType) && allowsPreferredExtensionFallback(detected):
		return extType
	default:
		return ""
	}
}

func detectMediaTypeFromFile(sourcePath string) string {
	file, err := os.Open(sourcePath)
	if err != nil {
		return ""
	}
	defer file.Close()

	header := make([]byte, 512)
	n, err := io.ReadFull(file, header)
	if err != nil && err != io.EOF && err != io.ErrUnexpectedEOF {
		return ""
	}
	if n <= 0 {
		return ""
	}
	return detectMediaTypeFromBytes(header[:n])
}

func detectMediaTypeFromBytes(data []byte) string {
	if mediaType := detectISOBMFFMediaType(data); mediaType != "" {
		return mediaType
	}
	return http.DetectContentType(data)
}

func detectISOBMFFMediaType(data []byte) string {
	if len(data) < 12 || string(data[4:8]) != "ftyp" {
		return ""
	}
	boxSize := int(binary.BigEndian.Uint32(data[:4]))
	if boxSize != 0 && boxSize < 16 {
		return ""
	}
	end := len(data)
	if boxSize > 0 && boxSize < end {
		end = boxSize
	}
	brands := make([]string, 0, 1+(end-16)/4)
	brands = append(brands, string(data[8:12]))
	for offset := 16; offset+4 <= end; offset += 4 {
		brands = append(brands, string(data[offset:offset+4]))
	}
	for _, brand := range brands {
		switch brand {
		case "avif", "avis":
			return "image/avif"
		}
	}
	for _, brand := range brands {
		switch brand {
		case "heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs":
			return "image/heic"
		}
	}
	for _, brand := range brands {
		switch brand {
		case "mif1", "msf1":
			return "image/heif"
		}
	}
	for _, brand := range brands {
		if brand == "qt  " {
			return "video/quicktime"
		}
	}
	for _, brand := range brands {
		switch brand {
		case "isom", "iso2", "iso3", "iso4", "iso5", "iso6", "iso7", "iso8", "iso9",
			"mp41", "mp42", "avc1", "M4V ", "M4A ", "MSNV", "dash", "cmfc", "cmfs":
			return "video/mp4"
		}
	}
	return ""
}

func normalizedMediaType(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	switch value {
	case "image/jpg":
		return "image/jpeg"
	case "image/heic-sequence":
		return "image/heic"
	case "image/heif-sequence":
		return "image/heif"
	case "video/x-m4v":
		return "video/mp4"
	case "video/x-quicktime":
		return "video/quicktime"
	default:
		return value
	}
}

func trustedMediaType(value string) bool {
	return strings.HasPrefix(value, "image/") || strings.HasPrefix(value, "video/")
}

func sameMediaFamily(left, right string) bool {
	return (strings.HasPrefix(left, "image/") && strings.HasPrefix(right, "image/")) ||
		(strings.HasPrefix(left, "video/") && strings.HasPrefix(right, "video/"))
}

func preferExtensionMediaType(value string) bool {
	return value == "image/heic" || value == "image/heif"
}

func allowsPreferredExtensionFallback(detected string) bool {
	switch detected {
	case "", "application/octet-stream":
		return true
	default:
		return false
	}
}

func mediaTypeForFileExtension(name string) string {
	switch strings.ToLower(filepath.Ext(strings.TrimSpace(name))) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".heic":
		return "image/heic"
	case ".heif":
		return "image/heif"
	case ".mov":
		return "video/quicktime"
	case ".mp4", ".m4v":
		return "video/mp4"
	default:
		return ""
	}
}

func detectStoredCapturedAtRaw(sourcePath, mediaType, originalName string) string {
	switch {
	case mediaType == "image/jpeg":
		if value := detectJPEGCapturedAtRaw(sourcePath); value != "" {
			return value
		}
		return detectFFprobeCapturedAtRaw(sourcePath)
	case mediaType == "image/heic", mediaType == "image/heif":
		return detectFFprobeCapturedAtRaw(sourcePath)
	case isTrustedVideoMediaType(mediaType):
		return detectFFprobeCapturedAtRaw(sourcePath)
	default:
		return ""
	}
}

func detectJPEGCapturedAtRaw(sourcePath string) string {
	file, err := os.Open(sourcePath)
	if err != nil {
		return ""
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, 1<<20))
	if err != nil {
		return ""
	}
	return parseJPEGExifCapturedAtRaw(data)
}

func parseJPEGExifCapturedAtRaw(data []byte) string {
	if len(data) < 4 || data[0] != 0xFF || data[1] != 0xD8 {
		return ""
	}
	offset := 2
	for offset+4 < len(data) {
		if data[offset] != 0xFF {
			break
		}
		marker := data[offset+1]
		offset += 2
		if marker == 0xDA || marker == 0xD9 {
			break
		}
		if offset+2 > len(data) {
			break
		}
		size := int(binary.BigEndian.Uint16(data[offset : offset+2]))
		if size < 2 || offset+size > len(data) {
			break
		}
		segment := data[offset+2 : offset+size]
		if marker == 0xE1 && len(segment) > 6 && string(segment[:6]) == "Exif\x00\x00" {
			return parseExifCapturedAtRaw(segment[6:])
		}
		offset += size
	}
	return ""
}

func parseExifCapturedAtRaw(data []byte) string {
	if len(data) < 8 {
		return ""
	}

	var order binary.ByteOrder
	switch string(data[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return ""
	}
	if order.Uint16(data[2:4]) != 0x2A {
		return ""
	}

	ifd0Offset := int(order.Uint32(data[4:8]))
	if ifd0Offset <= 0 || ifd0Offset+2 > len(data) {
		return ""
	}

	ifd0Dates, exifOffset := extractExifDateValues(data, order, ifd0Offset)
	if exifOffset > 0 && exifOffset+2 <= len(data) {
		if exifDates, _ := extractExifDateValues(data, order, exifOffset); len(exifDates) > 0 {
			for _, tag := range []uint16{0x9003, 0x9004, 0x0132} {
				if value := strings.TrimSpace(exifDates[tag]); value != "" {
					return value
				}
			}
		}
	}
	for _, tag := range []uint16{0x9003, 0x9004, 0x0132} {
		if value := strings.TrimSpace(ifd0Dates[tag]); value != "" {
			return value
		}
	}
	return ""
}

func extractExifDateValues(data []byte, order binary.ByteOrder, ifdOffset int) (map[uint16]string, int) {
	values := make(map[uint16]string)
	if ifdOffset <= 0 || ifdOffset+2 > len(data) {
		return values, 0
	}

	count := int(order.Uint16(data[ifdOffset : ifdOffset+2]))
	entryOffset := ifdOffset + 2
	exifOffset := 0

	for index := 0; index < count; index++ {
		entry := entryOffset + index*12
		if entry+12 > len(data) {
			break
		}
		tag := order.Uint16(data[entry : entry+2])
		valueType := order.Uint16(data[entry+2 : entry+4])
		valueCount := order.Uint32(data[entry+4 : entry+8])
		valueField := data[entry+8 : entry+12]

		if tag == 0x8769 {
			exifOffset = int(order.Uint32(valueField))
			continue
		}

		switch tag {
		case 0x0132, 0x9003, 0x9004:
			if value := readExifASCIIValue(data, order, valueType, valueCount, valueField); value != "" {
				values[tag] = value
			}
		}
	}

	return values, exifOffset
}

func readExifASCIIValue(data []byte, order binary.ByteOrder, valueType uint16, valueCount uint32, valueField []byte) string {
	if valueType != 2 || valueCount == 0 {
		return ""
	}

	var raw []byte
	if valueCount <= 4 {
		raw = valueField[:valueCount]
	} else {
		offset := int(order.Uint32(valueField))
		end := offset + int(valueCount)
		if offset < 0 || end > len(data) || offset >= end {
			return ""
		}
		raw = data[offset:end]
	}

	return strings.Trim(strings.TrimSpace(string(raw)), "\x00")
}

func detectFFprobeCapturedAtRaw(sourcePath string) string {
	if _, err := exec.LookPath("ffprobe"); err != nil {
		return ""
	}

	cmd := exec.Command("ffprobe", buildFFprobeReadArgs(
		sourcePath,
		"-show_entries", "format_tags=creation_time,com.apple.quicktime.creationdate,date:stream_tags=creation_time,com.apple.quicktime.creationdate,date",
		"-of", "default=noprint_wrappers=1:nokey=1",
	)...)
	output, err := cmd.Output()
	if err != nil {
		return ""
	}

	for _, line := range strings.Split(string(output), "\n") {
		if value := strings.TrimSpace(line); value != "" {
			return value
		}
	}
	return ""
}
