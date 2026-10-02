"""
Excel generation — Python/openpyxl port of frontend/src/lib/excel.js.

Why this exists as a second implementation instead of reusing the JS one:
the approval workflow needs the backend to (a) generate the file at submit
time and (b) re-open that *exact same file* later to inject signatures,
without a browser in the loop. openpyxl is the natural tool for that on
the Python side.

Keep this in sync with excel.js if the visual template changes — column
widths, fonts, tint formula, and the group-separator positions are
intentionally identical to that file so a schedule looks the same whether
downloaded directly or produced via the approval flow.
"""

from dataclasses import dataclass, asdict
from datetime import date, datetime
import calendar
import io
import math

from PIL import Image as PILImage, ImageChops
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
from openpyxl.utils import get_column_letter
from openpyxl.drawing.image import Image as XLImage
from openpyxl.drawing.spreadsheet_drawing import OneCellAnchor, AnchorMarker
from openpyxl.drawing.xdr import XDRPositiveSize2D
from openpyxl.utils.units import pixels_to_EMU

FONT_NAME = "TH Sarabun New"
FONT_SIZE = 18
THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
               "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"]
THAI_WEEKDAYS = ["จ","อ","พ","พฤ","ศ","ส","อา"]  # Python weekday(): 0=Mon
GRID = "D8D2C4"
# Blank rows inserted after these 1-based employee positions — keep this in
# sync with GROUP_SEPARATOR_AFTER in excel.js.
GROUP_SEPARATOR_AFTER = {4, 9, 13, 17}


def days_in_month(year_be: int, month: int) -> int:
    return calendar.monthrange(year_be - 543, month)[1]


def weekday_label(year_be: int, month: int, day: int) -> str:
    return THAI_WEEKDAYS[date(year_be - 543, month, day).weekday()]


def is_weekend(year_be: int, month: int, day: int) -> bool:
    return date(year_be - 543, month, day).weekday() >= 5


def is_holiday(year_be: int, month: int, day: int, holidays: list) -> dict | None:
    for h in holidays:
        if h["month"] == month and h["day"] == day and (h.get("year") is None or h["year"] == year_be):
            return h
    return None


def parse_cell_value(raw: str) -> dict:
    if not raw:
        return {"base": "", "wh": False, "th": False, "ot": False}
    v = raw.strip().upper()
    for suffix, key in (("WH", "wh"), ("TH", "th"), ("OT", "ot")):
        if v.endswith(suffix) and len(v) > 2:
            return {"base": v[:-2], "wh": key == "wh", "th": key == "th", "ot": key == "ot"}
    return {"base": v, "wh": False, "th": False, "ot": False}


def tint_hex(hex_color: str, amount: float) -> str:
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    mix = lambda c: round(c + (255 - c) * amount)
    return f"{mix(r):02X}{mix(g):02X}{mix(b):02X}"


def argb(hex_color: str) -> str:
    """openpyxl wants 8-hex ARGB; without the FF alpha prefix colors render
    as fully transparent (bit us once already on the JS side)."""
    return "FF" + hex_color.lstrip("#").upper()


def contrast_text(hex_color: str) -> str:
    """Picks black or white, whichever stays readable against an arbitrary
    background — used for a manually-picked cell highlight, which (unlike
    a shift code's own tint-derived background) could be any color at
    all, so the shift code's own text color can't be assumed to still
    have enough contrast against it."""
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return "0F172A" if luminance > 0.6 else "FFFFFF"


@dataclass
class SignatureLayout:
    """Recorded at generation time and stored on the approval_cycles row —
    the callback reads these back instead of assuming fixed coordinates,
    since they shift with employee count / holidays that month."""
    sig_line_row: int   # blank underline row -> gets the approver's name
    sig_label_row: int  # static "ผู้จัดการแผนก" / "ผู้จัดการส่วน" caption -> untouched
    sig_date_row: int   # "……./……./……" placeholder -> gets the approval date
    sig_cert_row: int   # blank until approval -> gets the Power Automate
                         # Approval ID as a small audit-trail reference,
                         # e.g. "รหัสอ้างอิง: 08584125..."
    block1_start: int   # Section Manager's column (1-indexed)
    block2_start: int   # Division Manager's column (1-indexed)
    block_width: int


def build_workbook(state: dict, holidays: list) -> tuple[Workbook, SignatureLayout]:
    nd = days_in_month(state["yearBE"], state["month"])
    NUM_FIXED_COLS = 3
    last_col = NUM_FIXED_COLS + nd + 1  # 1-indexed: note column

    wb = Workbook()
    ws = wb.active
    ws.title = "ตารางกะ"

    base_font = Font(name=FONT_NAME, size=FONT_SIZE)
    bold_font = Font(name=FONT_NAME, size=FONT_SIZE, bold=True)
    grid_side = Side(style="thin", color=argb(GRID))
    all_sides = Border(top=grid_side, bottom=grid_side, left=grid_side, right=grid_side)
    center = Alignment(horizontal="center", vertical="center")
    center_wrap = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left = Alignment(horizontal="left", vertical="center")

    def set_row_height(row, pt):
        ws.row_dimensions[row].height = pt

    # ---- title block ----
    ws.cell(row=1, column=1, value="ตารางปฏิบัติงานประจำเดือน")
    ws.cell(row=2, column=1, value=state.get("department", ""))
    ws.cell(row=3, column=1, value=f"ประจำเดือน {THAI_MONTHS[state['month']-1]} {state['yearBE']}")
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=last_col)
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=last_col)
    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=last_col)
    ws.cell(row=1, column=1).font = bold_font
    ws.cell(row=2, column=1).font = bold_font
    ws.cell(row=3, column=1).font = Font(name=FONT_NAME, size=FONT_SIZE, bold=True, color=argb("6B645C"))
    for r in (1, 2, 3):
        ws.cell(row=r, column=1).alignment = center
    set_row_height(1, 27); set_row_height(2, 27); set_row_height(3, 27)
    set_row_height(4, 6)  # spacer

    # ---- header rows (5 = labels/day numbers, 6 = weekday letters) ----
    ws.cell(row=5, column=1, value="ลำดับ")
    ws.cell(row=5, column=2, value="รหัส")
    ws.cell(row=5, column=3, value="ชื่อ-สกุล")
    ws.cell(row=5, column=last_col, value="หมายเหตุ")
    ws.merge_cells(start_row=5, start_column=1, end_row=6, end_column=1)
    ws.merge_cells(start_row=5, start_column=2, end_row=6, end_column=2)
    ws.merge_cells(start_row=5, start_column=3, end_row=6, end_column=3)
    ws.merge_cells(start_row=5, start_column=last_col, end_row=6, end_column=last_col)
    set_row_height(5, 24); set_row_height(6, 18)

    for d in range(1, nd + 1):
        col = NUM_FIXED_COLS + d
        hol = is_holiday(state["yearBE"], state["month"], d, holidays)
        weekend = is_weekend(state["yearBE"], state["month"], d)
        fill_hex = "FDEAEA" if hol else ("FAF6EE" if weekend else "FAF8F4")
        wd_color = "B91C1C" if hol else "B45309"
        ws.cell(row=5, column=col, value=d)
        ws.cell(row=6, column=col, value=weekday_label(state["yearBE"], state["month"], d))
        for r in (5, 6):
            c = ws.cell(row=r, column=col)
            c.fill = PatternFill("solid", fgColor=argb(fill_hex))
            c.border = all_sides
            c.alignment = center_wrap if r == 5 else center
        ws.cell(row=5, column=col).font = bold_font
        ws.cell(row=6, column=col).font = Font(name=FONT_NAME, size=FONT_SIZE, bold=True, color=argb(wd_color))

    for c in (1, 2, 3, last_col):
        for r in (5, 6):
            cell = ws.cell(row=r, column=c)
            cell.font = bold_font
            cell.fill = PatternFill("solid", fgColor=argb("FAF8F4"))
            cell.border = all_sides
            cell.alignment = center_wrap if r == 5 else center

    # ---- employee data rows (with group-separator blank rows) ----
    shift_codes = {c["code"].upper(): c for c in state["shiftCodes"]}
    row = 7
    for idx, emp in enumerate(state["employees"]):
        ws.cell(row=row, column=1, value=idx + 1).font = base_font
        ws.cell(row=row, column=2, value=emp.get("empCode", "")).font = base_font
        name_cell = ws.cell(row=row, column=3, value=emp.get("name", ""))
        name_cell.font = bold_font
        name_cell.alignment = left
        for c in (1, 2):
            ws.cell(row=row, column=c).alignment = center
        ot_color = state.get("otColor") or "#c2517d"
        th_color = state.get("thColor") or "#b45050"
        for d in range(1, nd + 1):
            col = NUM_FIXED_COLS + d
            raw = (emp.get("days", {}).get(str(d)) or emp.get("days", {}).get(d) or "")
            parsed = parse_cell_value(raw)
            base = parsed["base"]
            cell = ws.cell(row=row, column=col, value=raw)
            cell.alignment = center
            defn = shift_codes.get(base)
            if defn:
                # 0.68 (not 0.55) matches the current web-table tint — this
                # was out of sync with logic.js's styleForCell, so the
                # generated/approved file's WH/TH cells read visibly more
                # saturated than what the person actually saw on screen.
                tint_amt = 0.68 if (parsed["wh"] or parsed["th"]) else 0.86
                bg = tint_hex(defn["color"], tint_amt)
                fg = defn["color"].lstrip("#").upper()
                cell.font = Font(name=FONT_NAME, size=FONT_SIZE, bold=True, color=argb(fg))
                cell.fill = PatternFill("solid", fgColor=argb(bg))
                if parsed["wh"]:
                    s = Side(style="dashed", color=argb(fg)); cell.border = Border(top=s, bottom=s, left=s, right=s)
                elif parsed["th"]:
                    s = Side(style="dotted", color=argb(th_color)); cell.border = Border(top=s, bottom=s, left=s, right=s)
                elif parsed["ot"]:
                    s = Side(style="medium", color=argb(ot_color)); cell.border = Border(top=s, bottom=s, left=s, right=s)
                else:
                    cell.border = all_sides
            elif base == "WH":
                cell.font = Font(name=FONT_NAME, size=FONT_SIZE, color=argb("6B645C"))
                cell.fill = PatternFill("solid", fgColor=argb("EFECE4"))
                cell.border = all_sides
            else:
                cell.font = base_font
                cell.border = all_sides
                hol = is_holiday(state["yearBE"], state["month"], d, holidays)
                if hol:
                    cell.fill = PatternFill("solid", fgColor=argb("FDEAEA"))
            # A manual highlight (right-click on the web table) is purely
            # visual and independent of the shift code — overrides the
            # fill only, keeps whatever border the WH/TH/OT flags above
            # already set, and switches to a contrasting font color since
            # an arbitrary user-picked color can't be assumed to work with
            # the shift code's own (tint-tuned) text color.
            highlight = (emp.get("cellColors") or {}).get(str(d)) or (emp.get("cellColors") or {}).get(d)
            if highlight:
                cell.fill = PatternFill("solid", fgColor=argb(highlight))
                cell.font = Font(name=cell.font.name, size=cell.font.size, bold=cell.font.bold,
                                  color=argb(contrast_text(highlight)))
        for c in (1, 2, 3):
            ws.cell(row=row, column=c).border = all_sides
        note_cell = ws.cell(row=row, column=last_col, value=emp.get("note", ""))
        note_cell.font = base_font
        note_cell.alignment = left
        note_cell.border = all_sides
        note_color = emp.get("noteColor")
        if note_color:
            note_cell.fill = PatternFill("solid", fgColor=argb(note_color))
            note_cell.font = Font(name=base_font.name, size=base_font.size, color=argb(contrast_text(note_color)))
        set_row_height(row, 27)
        row += 1

        if (idx + 1) in GROUP_SEPARATOR_AFTER:
            for c in range(1, last_col + 1):
                cell = ws.cell(row=row, column=c)
                cell.font = base_font
                cell.border = all_sides
            set_row_height(row, 27)
            row += 1

    # ---- signature block: 4 blank spacer rows, then line / label / date ----
    row += 4
    sig_block_width = 4
    sig_gap = 2
    block2_end = last_col - 1  # last *day* column, not the note column
    block2_start = max(1, block2_end - sig_block_width + 1)
    block1_end = max(1, block2_start - sig_gap - 1)
    block1_start = max(1, block1_end - sig_block_width + 1)

    sig_line_row = row
    ws.merge_cells(start_row=sig_line_row, start_column=block1_start,
                    end_row=sig_line_row, end_column=block1_start + sig_block_width - 1)
    ws.merge_cells(start_row=sig_line_row, start_column=block2_start,
                    end_row=sig_line_row, end_column=block2_start + sig_block_width - 1)
    dash = Side(style="dashed", color=argb("6B645C"))
    for c in (block1_start, block2_start):
        ws.cell(row=sig_line_row, column=c).border = Border(bottom=dash)
        ws.cell(row=sig_line_row, column=c).alignment = center
    set_row_height(sig_line_row, 26.1)
    row += 1

    sig_label_row = row
    ws.cell(row=sig_label_row, column=block1_start, value="ผู้จัดการแผนก")
    ws.cell(row=sig_label_row, column=block2_start, value="ผู้จัดการส่วน")
    ws.merge_cells(start_row=sig_label_row, start_column=block1_start,
                    end_row=sig_label_row, end_column=block1_start + sig_block_width - 1)
    ws.merge_cells(start_row=sig_label_row, start_column=block2_start,
                    end_row=sig_label_row, end_column=block2_start + sig_block_width - 1)
    for c in (block1_start, block2_start):
        cell = ws.cell(row=sig_label_row, column=c)
        cell.font = Font(name=FONT_NAME, size=FONT_SIZE, color=argb("6B645C"))
        cell.alignment = center
    set_row_height(sig_label_row, 27)
    row += 1

    sig_date_row = row
    ws.cell(row=sig_date_row, column=block1_start, value="……./……./……")
    ws.cell(row=sig_date_row, column=block2_start, value="……./……./……")
    ws.merge_cells(start_row=sig_date_row, start_column=block1_start,
                    end_row=sig_date_row, end_column=block1_start + sig_block_width - 1)
    ws.merge_cells(start_row=sig_date_row, start_column=block2_start,
                    end_row=sig_date_row, end_column=block2_start + sig_block_width - 1)
    for c in (block1_start, block2_start):
        cell = ws.cell(row=sig_date_row, column=c)
        cell.font = base_font
        cell.alignment = center
    row += 1

    # Reserved, left blank until the outcome callback injects the actual
    # Power Automate Approval ID — small/muted so it reads as a reference
    # number, not competing visually with the name/date above it.
    sig_cert_row = row
    ws.merge_cells(start_row=sig_cert_row, start_column=block1_start,
                    end_row=sig_cert_row, end_column=block1_start + sig_block_width - 1)
    ws.merge_cells(start_row=sig_cert_row, start_column=block2_start,
                    end_row=sig_cert_row, end_column=block2_start + sig_block_width - 1)
    cert_font = Font(name=FONT_NAME, size=11, color=argb("475569"))
    for c in (block1_start, block2_start):
        cell = ws.cell(row=sig_cert_row, column=c)
        cell.font = cert_font
        cell.alignment = center
    set_row_height(sig_cert_row, 15)

    # ---- column widths ----
    ws.column_dimensions["A"].width = 6.02
    ws.column_dimensions["B"].width = 12.02
    ws.column_dimensions["C"].width = 33.16
    for d in range(1, nd + 1):
        ws.column_dimensions[get_column_letter(NUM_FIXED_COLS + d)].width = 9.02
    ws.column_dimensions[get_column_letter(last_col)].width = 47.02
    ws.page_setup.orientation = "landscape"

    layout = SignatureLayout(
        sig_line_row=sig_line_row, sig_label_row=sig_label_row, sig_date_row=sig_date_row,
        sig_cert_row=sig_cert_row,
        block1_start=block1_start, block2_start=block2_start, block_width=sig_block_width,
    )
    return wb, layout


def _fmt_thai_date(iso_str: str) -> str:
    dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    return f"{dt.day:02d}/{dt.month:02d}/{dt.year + 543}"


def _excel_width_to_px(char_width: float) -> float:
    """Excel's own documented formula for converting a column's character
    width to pixels (MDW = Maximum Digit Width of the default font,
    Calibri 11 = 7px): pixels = TRUNCATE(((256*width + TRUNCATE(128/MDW))
    / 256) * MDW). This replaced a rough width*7+5 approximation that
    overestimated by ~5px per column — a 20px cumulative error across the
    4-column signature block, which was small enough to not obviously
    break anything but large enough to visibly shift the calculated
    "center" away from where Excel itself centers the text label sharing
    the same merged range, since that label's centering is native/exact
    and doesn't go through this approximation at all."""
    mdw = 7
    return math.floor(((256 * char_width + math.floor(128 / mdw)) / 256) * mdw)


def _crop_to_content(path: str) -> io.BytesIO:
    """Trims blank margin from a signature image down to the actual ink's
    bounding box, in memory (returns a BytesIO, doesn't touch the file on
    disk). Necessary before scaling: two managers' uploads can be the same
    *file* dimensions while the actual signature strokes occupy very
    different fractions of that canvas — one might be tightly cropped,
    another might have wide margins from how they scanned or exported it.
    Scaling the raw file dimensions to fit the same box (the old behavior)
    made the second one look smaller even though the strokes themselves
    should read as roughly the same size on the page. Cropping to content
    first means the *ink*, not the canvas, is what gets sized consistently."""
    img = PILImage.open(path)
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        # PNG with real transparency — crop to the alpha channel's bbox.
        bbox = img.convert("RGBA").split()[-1].getbbox()
    else:
        # No transparency (a JPEG, or a flattened PNG) — assume a light/white
        # background and crop to whatever isn't close to white.
        rgb = img.convert("RGB")
        diff = ImageChops.difference(rgb, PILImage.new("RGB", rgb.size, (255, 255, 255)))
        # A pure-white pixel differs from white by 0; a small tolerance
        # (10) absorbs JPEG compression noise in what should be blank
        # background without also eating faint, thin pen strokes.
        bbox = diff.point(lambda p: 255 if p > 10 else 0).convert("L").getbbox()
    cropped = img.crop(bbox) if bbox else img

    buf = io.BytesIO()
    cropped.save(buf, format="PNG")  # PNG regardless of source format — lossless, keeps any alpha
    buf.seek(0)
    return buf


def _place_signature_image(ws, path: str, row: int, col: int, block_width: int,
                            width_fraction: float = 0.72, height_fraction: float = 0.72):
    """Anchors a signature PNG inside the merged underline range, scaled
    down (never up) to fit within a fraction of the block's *actual*
    measured width/height while keeping its own aspect ratio, then
    centered in the remaining space both ways.

    Deliberately sized as a fraction of the real measured block, not a
    fixed pixel cap: a fixed cap (e.g. "36px tall") can end up taller
    than the row actually is, which forces the centering offset to clamp
    to 0 and pins the image to one edge instead of centering it — exactly
    backwards from the goal. Sizing relative to the block's own dimensions
    guarantees visible margin on every side regardless of the workbook's
    actual row height or column widths."""
    total_width_px = sum(
        _excel_width_to_px(ws.column_dimensions[get_column_letter(col + i)].width or 8.43)
        for i in range(block_width)
    )
    row_height_pt = ws.row_dimensions[row].height or 15  # Excel's own default
    total_height_px = row_height_pt * 96 / 72  # pt -> px at 96 DPI

    max_width = total_width_px * width_fraction
    max_height = total_height_px * height_fraction

    img = XLImage(_crop_to_content(path))
    scale = min(max_width / img.width, max_height / img.height, 1.0)
    img.width = int(img.width * scale)
    img.height = int(img.height * scale)

    col_off_px = max(0, (total_width_px - img.width) / 2)
    # Empirical calibration: the math above is exact per Excel's own
    # documented column-width formula (verified: predicted offset matched
    # a real generated file's actual offset exactly, 89.0px = 89.0px) —
    # but real-world testing in actual Excel still showed the signature
    # sitting a consistent ~20-30px left of true-center. Most likely cause
    # is font substitution (this math assumes Calibri/MDW=7, which only
    # holds if Calibri is what's actually installed and rendering on the
    # viewer's machine) or residual asymmetric padding surviving the
    # content crop — neither reproducible from here without the actual
    # signature file and viewing environment. Nudging right by a fixed
    # amount, clamped to the block's own width, is the practical fix until
    # there's a way to verify the real cause directly.
    col_off_px = min(col_off_px + 25, max(0, total_width_px - img.width))
    row_off_px = max(0, (total_height_px - img.height) / 2)

    anchor = OneCellAnchor()
    anchor._from = AnchorMarker(
        col=col - 1, colOff=pixels_to_EMU(col_off_px),  # openpyxl anchors are 0-indexed
        row=row - 1, rowOff=pixels_to_EMU(row_off_px),
    )
    anchor.ext = XDRPositiveSize2D(cx=pixels_to_EMU(img.width), cy=pixels_to_EMU(img.height))
    img.anchor = anchor
    ws.add_image(img)


def _inject_signature_block(
    ws, layout: SignatureLayout, col: int,
    name: str, approved_at: str,
    signature_path: str | None, approval_id: str | None,
):
    """One manager's block: signature image (or, if they haven't uploaded
    one yet, their typed name as a fallback — a missing signature image
    must never be the reason an approval can't complete), plus the date
    and audit-trail cert line, which stay as text either way."""
    base_font = Font(name=FONT_NAME, size=FONT_SIZE)
    center = Alignment(horizontal="center", vertical="center")

    if signature_path:
        _place_signature_image(ws, signature_path, layout.sig_line_row, col, layout.block_width)
        # The dashed underline is a "sign here" guide for the unsigned
        # template — once a real signature image is sitting there, the
        # guide line under/through it just looks like clutter, so drop it.
        #
        # Unmerge/restyle/re-merge, not a direct border assignment: this
        # cell is the anchor of a merged range that was already saved and
        # reloaded (this function runs on a freshly load_workbook()'d
        # file). Confirmed via an isolated repro that directly setting
        # `.border = Border()` on an already-merged range's anchor cell
        # silently reverts to its old border on the *next* save+reload —
        # openpyxl re-derives merged-range cell styling from somewhere
        # that a plain assignment doesn't update. Unmerging first, then
        # restyling, then re-merging avoids whatever stale state that is.
        merge_range = f"{get_column_letter(col)}{layout.sig_line_row}:{get_column_letter(col + layout.block_width - 1)}{layout.sig_line_row}"
        ws.unmerge_cells(merge_range)
        ws.cell(row=layout.sig_line_row, column=col).border = Border()
        ws.merge_cells(merge_range)
    else:
        name_cell = ws.cell(row=layout.sig_line_row, column=col, value=name)
        name_cell.font = base_font
        name_cell.alignment = center

    date_cell = ws.cell(row=layout.sig_date_row, column=col, value=_fmt_thai_date(approved_at))
    date_cell.font = base_font
    date_cell.alignment = center
    if approval_id:
        cert_cell = ws.cell(row=layout.sig_cert_row, column=col, value=f"รหัสอ้างอิง: {approval_id}")
        cert_cell.font = Font(name=FONT_NAME, size=11, color=argb("475569"))
        cert_cell.alignment = center


def inject_section_signature(
    pending_path: str, layout: SignatureLayout,
    section_name: str, section_approved_at: str,
    signature_path: str | None = None, section_approval_id: str | None = None,
) -> Workbook:
    """Called right after the Section Manager approves — stamps only
    their block, so the file that goes on to the Division Manager already
    shows a real signature, not a name that gets filled in only once
    everything is done."""
    wb = load_workbook(pending_path)
    _inject_signature_block(
        wb.active, layout, layout.block1_start,
        section_name, section_approved_at, signature_path, section_approval_id,
    )
    return wb


def inject_division_signature(
    pending_path: str, layout: SignatureLayout,
    division_name: str, division_approved_at: str,
    signature_path: str | None = None, division_approval_id: str | None = None,
) -> Workbook:
    """Called at final approval — the file at pending_path already has the
    section signature baked in (from inject_section_signature above,
    which was saved back over the same path), so this only needs to add
    the division block on top."""
    wb = load_workbook(pending_path)
    _inject_signature_block(
        wb.active, layout, layout.block2_start,
        division_name, division_approved_at, signature_path, division_approval_id,
    )
    return wb
