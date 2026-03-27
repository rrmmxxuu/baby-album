package main

import (
	"encoding/binary"
	"fmt"
	"image"
	"io"
)

func readJPEGOrientation(r io.Reader) (int, error) {
	data, err := io.ReadAll(io.LimitReader(r, 1<<20))
	if err != nil {
		return 1, err
	}
	if len(data) < 4 || data[0] != 0xFF || data[1] != 0xD8 {
		return 1, fmt.Errorf("not jpeg")
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
			return parseExifOrientation(segment[6:])
		}
		offset += size
	}
	return 1, fmt.Errorf("orientation not found")
}

func parseExifOrientation(data []byte) (int, error) {
	if len(data) < 8 {
		return 1, fmt.Errorf("short exif")
	}
	var order binary.ByteOrder
	switch string(data[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 1, fmt.Errorf("invalid byte order")
	}
	if order.Uint16(data[2:4]) != 0x2A {
		return 1, fmt.Errorf("invalid tiff header")
	}
	ifdOffset := int(order.Uint32(data[4:8]))
	if ifdOffset+2 > len(data) {
		return 1, fmt.Errorf("invalid ifd offset")
	}
	count := int(order.Uint16(data[ifdOffset : ifdOffset+2]))
	entryOffset := ifdOffset + 2
	for i := 0; i < count; i++ {
		entry := entryOffset + i*12
		if entry+12 > len(data) {
			break
		}
		tag := order.Uint16(data[entry : entry+2])
		if tag != 0x0112 {
			continue
		}
		value := order.Uint16(data[entry+8 : entry+10])
		if value < 1 || value > 8 {
			return 1, nil
		}
		return int(value), nil
	}
	return 1, fmt.Errorf("orientation tag missing")
}

func applyOrientation(src image.Image, orientation int) image.Image {
	switch orientation {
	case 3:
		return rotate180(src)
	case 6:
		return rotate90CW(src)
	case 8:
		return rotate90CCW(src)
	default:
		return src
	}
}

func rotate180(src image.Image) image.Image {
	bounds := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	for y := 0; y < bounds.Dy(); y++ {
		for x := 0; x < bounds.Dx(); x++ {
			dst.Set(bounds.Dx()-1-x, bounds.Dy()-1-y, src.At(bounds.Min.X+x, bounds.Min.Y+y))
		}
	}
	return dst
}

func rotate90CW(src image.Image) image.Image {
	bounds := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, bounds.Dy(), bounds.Dx()))
	for y := 0; y < bounds.Dy(); y++ {
		for x := 0; x < bounds.Dx(); x++ {
			dst.Set(bounds.Dy()-1-y, x, src.At(bounds.Min.X+x, bounds.Min.Y+y))
		}
	}
	return dst
}

func rotate90CCW(src image.Image) image.Image {
	bounds := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, bounds.Dy(), bounds.Dx()))
	for y := 0; y < bounds.Dy(); y++ {
		for x := 0; x < bounds.Dx(); x++ {
			dst.Set(y, bounds.Dx()-1-x, src.At(bounds.Min.X+x, bounds.Min.Y+y))
		}
	}
	return dst
}
