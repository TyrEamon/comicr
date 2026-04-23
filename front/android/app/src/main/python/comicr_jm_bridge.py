import os
import re
from pathlib import Path
from urllib.parse import urlparse


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}


def parse_target(target):
    value = str(target or "").strip()
    if not value:
        raise ValueError("empty JM target")

    if value.lower().startswith("p") and value[1:].isdigit():
        return "photo", value[1:]

    if value.isdigit():
        return "album", value

    parsed = urlparse(value)
    parts = [part for part in parsed.path.split("/") if part]
    for index, part in enumerate(parts):
        label = part.lower()
        if label in {"photo", "album"} and index + 1 < len(parts):
            match = re.search(r"(\d+)", parts[index + 1])
            if match:
                return label, match.group(1)

    fallback = re.search(r"(\d+)", value)
    if fallback:
        return ("photo" if "photo" in value.lower() else "album"), fallback.group(1)

    raise ValueError(f"unsupported JM target: {target}")


def create_option(base_dir, image_threads):
    from jmcomic import JmOption

    return JmOption(
        dir_rule={
            "rule": "Bd_Pname",
            "base_dir": base_dir,
        },
        download={
            "cache": True,
            "image": {
                "decode": True,
                "suffix": None,
            },
            "threading": {
                "image": max(1, min(int(image_threads or 4), 8)),
                "photo": 1,
            },
        },
        client={
            "cache": None,
            "domain": [],
            "postman": {
                "type": "requests",
                "meta_data": {
                    "headers": None,
                    "proxies": {},
                },
            },
            "impl": "api",
            "retry_times": 5,
        },
        plugins={},
    )


def collect_images(root_dir):
    root = Path(root_dir)
    files = []
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES:
            files.append(path)

    files.sort(key=lambda path: [natural_key(part) for part in path.relative_to(root).parts])
    return [str(path) for path in files]


def natural_key(value):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", value)]


def make_downloader(progress):
    from jmcomic import JmDownloader

    class AndroidProgressDownloader(JmDownloader):
        def __init__(self, option):
            super().__init__(option)
            self.current = 0
            self.total = 0

        def before_album(self, album):
            super().before_album(album)
            self.total = int(getattr(album, "page_count", 0) or 0)
            emit_meta(progress, getattr(album, "title", "") or getattr(album, "name", ""), self.total)

        def before_photo(self, photo):
            super().before_photo(photo)
            if self.total <= 0:
                self.total = len(photo)
                emit_meta(progress, getattr(photo, "name", ""), self.total)

        def before_image(self, image, img_save_path):
            if progress is not None and bool(progress.isCancelled()):
                raise RuntimeError("下载已取消")
            super().before_image(image, img_save_path)

        def after_image(self, image, img_save_path):
            super().after_image(image, img_save_path)
            self.current += 1
            emit_progress(progress, self.current, self.total, getattr(image, "tag", ""))

    return AndroidProgressDownloader


def emit_meta(progress, title, total):
    if progress is None:
        return
    try:
        progress.onMeta(str(title or ""), int(total or 0))
    except Exception:
        pass


def emit_progress(progress, current, total, message):
    if progress is None:
        return
    try:
        progress.onProgress(int(current or 0), int(total or 0), str(message or ""))
    except Exception:
        pass


def download(target, output_dir, image_threads=4, progress=None):
    import jmcomic

    target_type, target_id = parse_target(target)
    os.makedirs(output_dir, exist_ok=True)

    option = create_option(output_dir, image_threads)
    client = option.build_jm_client()
    title = f"JM {target_id}"

    try:
        if target_type == "album":
            album = client.get_album_detail(target_id)
            title = getattr(album, "title", "") or getattr(album, "name", "") or title
        else:
            photo = client.get_photo_detail(target_id, False)
            title = getattr(photo, "name", "") or f"JM Photo {target_id}"
    except Exception:
        pass

    downloader = make_downloader(progress)
    if target_type == "photo":
        jmcomic.download_photo(target_id, option, downloader=downloader)
    else:
        jmcomic.download_album(target_id, option, downloader=downloader)

    images = collect_images(output_dir)
    if not images:
        raise RuntimeError("JM 下载完成但没有找到图片")

    return {
        "title": title,
        "images": images,
        "count": len(images),
    }
