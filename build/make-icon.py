"""
make-icon.py —— 生成应用图标 build/icon.ico（纯标准库，不依赖 Pillow）

设计：深色圆角底 + 青色光环 + 浅色头像剪影（头 + 肩），呼应 EVE 角色头像。
超采样 4 倍后降采样，得到抗锯齿边缘。
用法： python make-icon.py
"""

import os
import struct
import zlib

S = 1024          # 超采样画布边长
SS = 4            # 超采样倍数 -> 输出 256
OUT = 256
ICON_SIZES = [256, 128, 64, 48, 32, 16]

BG_TOP = (17, 32, 52)
BG_BOT = (6, 11, 20)
ACCENT = (79, 209, 224)
AVATAR = (176, 230, 242)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def inside_round_rect(x, y, w, h, r):
    dx = max(abs(x - w / 2.0) - (w / 2.0 - r), 0.0)
    dy = max(abs(y - h / 2.0) - (h / 2.0 - r), 0.0)
    return dx * dx + dy * dy <= r * r


def shade(nx, ny):
    """nx, ny 为 0..1 归一化坐标，返回 (r,g,b,a)"""
    # 1. 圆角底
    if not inside_round_rect(nx, ny, 1.0, 1.0, 0.225):
        return (0, 0, 0, 0)

    col = lerp(BG_TOP, BG_BOT, ny)

    cx, cy = 0.5, 0.5
    dist = ((nx - cx) ** 2 + (ny - cy) ** 2) ** 0.5

    # 2. 外光环
    ring_r, ring_t = 0.372, 0.026
    d = abs(dist - ring_r)
    if d <= ring_t / 2:
        a = 1.0
        col = lerp(col, ACCENT, a * 0.95)
    elif d <= ring_t / 2 + 0.030:
        f = 1.0 - (d - ring_t / 2) / 0.030
        col = lerp(col, ACCENT, max(0.0, f) * 0.20)

    # 3. 内细环
    d2 = abs(dist - 0.300)
    if d2 <= 0.007:
        col = lerp(col, ACCENT, 0.5)

    # 4. 头部剪影
    hx, hy, hr = 0.5, 0.375, 0.108
    if ((nx - hx) ** 2 + (ny - hy) ** 2) ** 0.5 <= hr:
        col = lerp(col, AVATAR, 0.97)

    # 5. 肩部剪影（椭圆，下缘裁掉）
    sx, sy, srx, sry = 0.5, 0.688, 0.238, 0.176
    if ((nx - sx) / srx) ** 2 + ((ny - sy) / sry) ** 2 <= 1.0 and ny <= 0.862:
        col = lerp(col, AVATAR, 0.90)

    return (col[0], col[1], col[2], 255)


def build_rgba():
    buf = bytearray(S * S * 4)
    inv = 1.0 / (S - 1)
    for y in range(S):
        ny = y * inv
        row = y * S * 4
        for x in range(S):
            r, g, b, a = shade(x * inv, ny)
            i = row + x * 4
            buf[i] = r
            buf[i + 1] = g
            buf[i + 2] = b
            buf[i + 3] = a
    return bytes(buf)


def downsample(rgba, src, dst):
    """把 src x src 降采样到 dst x dst（按覆盖加权，避免透明边发黑）"""
    out = bytearray(dst * dst * 4)
    block = src // dst
    for y in range(dst):
        for x in range(dst):
            rs = gs = bs = as_ = 0
            for j in range(block):
                row = (y * block + j) * src * 4
                for i in range(block):
                    p = row + (x * block + i) * 4
                    a = rgba[p + 3]
                    rs += rgba[p] * a
                    gs += rgba[p + 1] * a
                    bs += rgba[p + 2] * a
                    as_ += a
            o = (y * dst + x) * 4
            if as_ > 0:
                out[o] = min(255, rs // as_)
                out[o + 1] = min(255, gs // as_)
                out[o + 2] = min(255, bs // as_)
            out[o + 3] = as_ // (block * block)
    return bytes(out)


def scale_nearest(rgba, src, dst):
    out = bytearray(dst * dst * 4)
    for y in range(dst):
        sy = min(src - 1, y * src // dst)
        for x in range(dst):
            sx = min(src - 1, x * src // dst)
            si = (sy * src + sx) * 4
            di = (y * dst + x) * 4
            out[di:di + 4] = rgba[si:si + 4]
    return bytes(out)


def to_png(rgba, size):
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)
        raw += rgba[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
        + chunk(b'IEND', b'')
    )


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    print('渲染超采样画布 %dx%d ...' % (S, S))
    hi = build_rgba()
    print('降采样到 %dx%d ...' % (OUT, OUT))
    base = downsample(hi, S, OUT)

    images = []
    for size in ICON_SIZES:
        if size == OUT:
            data = base
        elif size > OUT:
            data = scale_nearest(base, OUT, size)
        else:
            data = downsample(base, OUT, size) if OUT % size == 0 else scale_nearest(base, OUT, size)
        images.append((size, to_png(data, size)))
        print('  + %dpx  %d bytes' % (size, len(images[-1][1])))

    # 组装 ICO（PNG 压缩格式，Vista+ 支持）
    count = len(images)
    header = struct.pack('<HHH', 0, 1, count)
    offset = 6 + 16 * count
    entries = b''
    body = b''
    for size, data in images:
        w = 0 if size >= 256 else size
        entries += struct.pack('<BBBBHHII', w, w, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
        body += data

    out_path = os.path.join(here, 'icon.ico')
    with open(out_path, 'wb') as f:
        f.write(header + entries + body)
    print('已生成: %s (%d bytes)' % (out_path, os.path.getsize(out_path)))


if __name__ == '__main__':
    main()
