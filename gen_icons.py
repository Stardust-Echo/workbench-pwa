#!/usr/bin/env python3
# Pure-python PNG icon generator (no external deps). Brand: cream rounded square + green sun.
import zlib, struct, math

def new_buf(w, h):
    return bytearray(w * h * 4)

def set_px(buf, w, h, x, y, r, g, b, a=255):
    if x < 0 or y < 0 or x >= w or y >= h:
        return
    i = (y * w + x) * 4
    # alpha blend onto existing (assume starts opaque or transparent)
    sa = a / 255.0
    dr, dg, db, da = buf[i], buf[i+1], buf[i+2], buf[i+3]
    da2 = sa + da/255.0*(1-sa)
    if da2 <= 0:
        buf[i:i+4] = bytes([r, g, b, 0])
        return
    out_r = int((r*sa + dr*da/255.0*(1-sa)) / da2)
    out_g = int((g*sa + dg*da/255.0*(1-sa)) / da2)
    out_b = int((b*sa + db*da/255.0*(1-sa)) / da2)
    buf[i:i+4] = bytes([out_r, out_g, out_b, int(da2*255)])

def fill_rect(buf, w, h, x0, y0, x1, y1, color):
    r, g, b, a = color
    for y in range(int(y0), int(y1)):
        for x in range(int(x0), int(x1)):
            set_px(buf, w, h, x, y, r, g, b, a)

def fill_circle(buf, w, h, cx, cy, rad, color):
    r, g, b, a = color
    for y in range(int(cy-rad), int(cy+rad)+1):
        for x in range(int(cx-rad), int(cx+rad)+1):
            if (x-cx)**2 + (y-cy)**2 <= rad*rad:
                set_px(buf, w, h, x, y, r, g, b, a)

def round_corners(buf, w, h, rad, color=(0,0,0,0)):
    # make corners transparent
    for y in range(h):
        for x in range(w):
            if (x < rad and y < rad and (rad-x)**2+(rad-y)**2 > rad*rad) or \
               (x >= w-rad and y < rad and (w-rad-x)**2+(rad-y)**2 > rad*rad) or \
               (x < rad and y >= h-rad and (rad-x)**2+(h-rad-y)**2 > rad*rad) or \
               (x >= w-rad and y >= h-rad and (w-rad-x)**2+(h-rad-y)**2 > rad*rad):
                set_px(buf, w, h, x, y, 0, 0, 0, 0)

def draw_sun(buf, w, h, cx, cy, rad, color):
    fill_circle(buf, w, h, cx, cy, rad, color)
    # rays
    for k in range(12):
        ang = k * math.pi / 6
        r0 = rad * 1.18
        r1 = rad * 1.5
        x0 = cx + math.cos(ang)*r0
        y0 = cy + math.sin(ang)*r0
        x1 = cx + math.cos(ang)*r1
        y1 = cy + math.sin(ang)*r1
        steps = int(max(abs(x1-x0), abs(y1-y0))) + 1
        for s in range(steps+1):
            t = s/steps
            set_px(buf, w, h, int(x0+(x1-x0)*t), int(y0+(y1-y0)*t), *color)

CREAM = (251, 244, 233, 255)
GREEN = (122, 174, 90, 255)
GREEN_D = (110, 158, 82, 255)

def make_icon(path, N, maskable=False, foreground=False):
    buf = new_buf(N, N)
    if foreground:
        # transparent background, sun centered within safe zone (inner ~60% of canvas)
        cx = cy = N/2
        rad = N * 0.20
        # rays
        for k in range(8):
            ang = k * math.pi / 4 + math.pi/16
            r0 = rad * 1.55
            r1 = rad * 2.0
            x0 = cx + math.cos(ang)*r0
            y0 = cy + math.sin(ang)*r0
            x1 = cx + math.cos(ang)*r1
            y1 = cy + math.sin(ang)*r1
            steps = int(max(abs(x1-x0), abs(y1-y0))) + 1
            for s in range(steps+1):
                t = s/steps
                set_px(buf, N, N, int(x0+(x1-x0)*t), int(y0+(y1-y0)*t), *GREEN)
        fill_circle(buf, N, N, cx, cy, rad, GREEN)
    elif maskable:
        fill_rect(buf, N, N, 0, 0, N, N, CREAM)  # full bleed, no transparency
        cx = cy = N/2
        rad = N * 0.16
        draw_sun(buf, N, N, cx, cy, rad, GREEN)
    else:
        fill_rect(buf, N, N, 0, 0, N, N, CREAM)
        rad = N * 0.22
        cx = cy = N/2
        # rays first (behind), then solid sun
        ray_color = (122, 174, 90, 255)
        for k in range(8):
            ang = k * math.pi / 4 + math.pi/16
            r0 = rad * 1.45
            r1 = rad * 1.85
            x0 = cx + math.cos(ang)*r0
            y0 = cy + math.sin(ang)*r0
            x1 = cx + math.cos(ang)*r1
            y1 = cy + math.sin(ang)*r1
            steps = int(max(abs(x1-x0), abs(y1-y0))) + 1
            for s in range(steps+1):
                t = s/steps
                set_px(buf, N, N, int(x0+(x1-x0)*t), int(y0+(y1-y0)*t), *ray_color)
        draw_sun(buf, N, N, cx, cy, rad, GREEN)
        round_corners(buf, N, N, int(N*0.18))
    write_png(path, N, N, buf)
    print("wrote", path, N)

def write_png(path, w, h, buf):
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter type 0
        raw.extend(buf[y*w*4:(y+1)*w*4])
    comp = zlib.compress(bytes(raw), 9)
    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        c += struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff)
        return c
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", comp))
        f.write(chunk(b"IEND", b""))

make_icon("icon-192.png", 192)
make_icon("icon-512.png", 512)
make_icon("maskable-512.png", 512, maskable=True)
make_icon("icon-foreground-512.png", 512, foreground=True)
print("done")
