#!/usr/bin/env python3
"""
Скачивает первичные источники пищевой ценности и сохраняет компактные выжимки в data/.
Запускается в GitHub Actions (.github/workflows/sources.yml), только стандартная библиотека.

  data/usda/foods.csv     fdc_id, dataset, description, kcal, protein, fat, carbs, fiber, sugar (на 100 г)
  data/usda/portions.csv  fdc_id, amount, unit, description, gram_weight
  data/usda/SOURCE.txt    откуда и когда скачано
  data/off/<query>.json   результаты поиска Open Food Facts (этикетки российских товаров)

USDA FoodData Central — public domain (CC0). Open Food Facts — ODbL, требуется указание источника.
"""
import csv
import urllib.error
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone

UA = "Fooder/0.1 (+https://github.com/vseznamus/Fooder)"
OUT = os.path.join(os.path.dirname(__file__), "..", "data")

# Наборы USDA: имя-префикс файла на странице загрузок → метка.
USDA_SETS = {
    "sr_legacy_food_csv": "sr_legacy",
    "survey_food_csv": "fndds",
}
# Известные адреса — на случай, если страницу не удастся разобрать.
USDA_FALLBACK = [
    "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip",
]

# SR Legacy использует id нутриентов FDC (1008…), FNDDS — старые номера (208…).
NUTRIENTS = {
    "kcal": ["1008", "2048", "2047", "208"],  # Energy (kcal)
    "protein": ["1003", "203"],
    "fat": ["1004", "204"],  # Total lipid (fat)
    "carbs": ["1005", "205"],  # Carbohydrate, by difference
    "fiber": ["1079", "291"],  # Fiber, total dietary
    "sugar": ["2000", "1063", "269"],  # Sugars, total
}


def get(url: str, timeout=300) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def discover_usda() -> dict[str, str]:
    found: dict[str, str] = {}
    for page in ["https://fdc.nal.usda.gov/download-datasets", "https://fdc.nal.usda.gov/download-datasets.html"]:
        try:
            html = get(page, 60).decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            print(f"page {page}: {e}")
            continue
        for href in re.findall(r'[\w:/.\-]*FoodData_Central_[\w\-]+\.zip', html):
            url = href if href.startswith("http") else urllib.parse.urljoin("https://fdc.nal.usda.gov/", href)
            for key, label in USDA_SETS.items():
                # Берём самый свежий (имена содержат дату — сортировка строк работает).
                if f"_{key}_" in url and (label not in found or url > found[label]):
                    found[label] = url
    if "sr_legacy" not in found:
        found["sr_legacy"] = USDA_FALLBACK[0]
    return found


def read_csv(z: zipfile.ZipFile, name: str):
    path = next((n for n in z.namelist() if n.endswith("/" + name) or n == name), None)
    if not path:
        print(f"  {name}: not found in archive")
        return
    with z.open(path) as f:
        # utf-8-sig: в части выгрузок FDC в начале файла BOM.
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
        print(f"  {path}: columns {reader.fieldnames}")
        yield from reader


def process_usda(label: str, url: str, foods_w, portions_w) -> int:
    print(f"USDA {label}: {url}")
    z = zipfile.ZipFile(io.BytesIO(get(url)))
    names = z.namelist()
    print(f"  archive: {len(names)} entries, e.g. {names[:12]}")
    # Вложенный архив (бывает у части выгрузок) — разворачиваем.
    inner = [n for n in names if n.endswith(".zip")]
    if inner and not any(n.endswith("food.csv") for n in names):
        z = zipfile.ZipFile(io.BytesIO(z.read(inner[0])))
        print(f"  nested: {z.namelist()[:12]}")
    foods = {r["fdc_id"]: r["description"] for r in read_csv(z, "food.csv")}
    print(f"  food.csv rows: {len(foods)}")
    wanted = {nid: key for key, ids in NUTRIENTS.items() for nid in ids}
    values: dict[str, dict[str, dict[str, float]]] = {}
    for r in read_csv(z, "food_nutrient.csv"):
        key = wanted.get(r["nutrient_id"])
        if key and r["fdc_id"] in foods and r["amount"]:
            values.setdefault(r["fdc_id"], {}).setdefault(key, {})[r["nutrient_id"]] = float(r["amount"])
    print(f"  foods with any nutrient: {len(values)}")
    if not values:
        sample = list(read_csv(z, "food_nutrient.csv"))[:3]
        print(f"  food_nutrient sample: {sample}")
    units = {r["id"]: r["name"] for r in read_csv(z, "measure_unit.csv")}
    n = 0
    for fid, desc in foods.items():
        v = values.get(fid, {})
        row = [fid, label, desc]
        for key, ids in NUTRIENTS.items():
            got = v.get(key, {})
            val = next((got[i] for i in ids if i in got), None)
            row.append("" if val is None else f"{val:g}")
        if row[3] == "" or row[4] == "":
            continue  # без калорий/белка — бесполезно
        foods_w.writerow(row)
        n += 1
    for r in read_csv(z, "food_portion.csv"):
        if r["fdc_id"] not in foods or not r.get("gram_weight"):
            continue
        unit = units.get(r.get("measure_unit_id", ""), "")
        if unit == "undetermined":
            unit = ""
        desc = r.get("portion_description") or r.get("modifier") or ""
        portions_w.writerow([r["fdc_id"], r.get("amount", ""), unit, desc, r["gram_weight"]])
    print(f"  foods with energy+protein: {n}")
    return n


# Российские продукты, которых нет в USDA: поиск по Open Food Facts.
OFF_QUERIES = [
    "творог 0%", "творог 2%", "творог 5%", "творог 9%", "творог зерненый",
    "кефир 1%", "кефир 2,5%", "кефир 3,2%", "ряженка", "варенец", "простокваша",
    "сметана 15%", "сметана 20%", "молоко 2,5%", "молоко 3,2%",
    "йогурт греческий", "сырок глазированный", "сыр российский", "сыр гауда", "сыр адыгейский",
    "сырники", "пельмени", "вареники с картофелем", "блины с творогом", "голубцы",
    "борщ", "щи", "солянка", "окрошка", "плов", "гречка с мясом",
    "хлеб бородинский", "батон нарезной", "хлебцы", "сушки",
    "докторская колбаса", "сосиски молочные", "ветчина",
    "майонез провансаль", "кетчуп", "зефир", "пастила", "пряник", "халва",
]


OFF_FIELDS = ["code", "product_name", "product_name_ru", "brands", "quantity", "countries_tags",
              "unique_scans_n", "energy-kcal_100g", "proteins_100g", "fat_100g",
              "carbohydrates_100g", "fiber_100g", "sugars_100g"]


def probe(url: str) -> str:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            return f"{r.status} {r.headers.get('content-type')}"
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}"
    except Exception as e:  # noqa: BLE001
        return f"ERR {e}"


def fetch_off() -> None:
    """Российские товары из Open Food Facts через search.openfoodfacts.org
    (старое API и выгрузка с серверов GitHub отвечают 403)."""
    os.makedirs(os.path.join(OUT, "off"), exist_ok=True)
    fields = "code,product_name,product_name_ru,brands,quantity,unique_scans_n,nutriments,countries_tags"
    for i, q in enumerate(OFF_QUERIES):
        params = urllib.parse.urlencode({
            "q": f'{q} countries_tags:"en:russia"',
            "langs": "ru",
            "page_size": 40,
            "fields": fields,
            "sort_by": "-unique_scans_n",
        })
        url = f"https://search.openfoodfacts.org/search?{params}"
        slug = re.sub(r"[^\w]+", "_", q).strip("_")
        try:
            data = json.loads(get(url, 90))
            hits = data.get("hits", [])
            if i == 0 and hits:
                print("  first hit keys:", sorted(hits[0].keys()))
                print("  first hit nutriments:", {k: v for k, v in (hits[0].get("nutriments") or {}).items() if k.endswith("_100g")})
            keep = []
            for p in hits:
                n = p.get("nutriments") or {}
                if any(n.get(k) is None for k in ("energy-kcal_100g", "proteins_100g", "fat_100g", "carbohydrates_100g")):
                    continue
                name = p.get("product_name_ru") or p.get("product_name")
                if isinstance(name, list):
                    name = name[0] if name else None
                brands = p.get("brands")
                if isinstance(brands, list):
                    brands = ", ".join(brands)
                keep.append({
                    "code": p.get("code"), "name": name, "brands": brands, "quantity": p.get("quantity"),
                    "scans": p.get("unique_scans_n"),
                    "kcal": n.get("energy-kcal_100g"), "protein": n.get("proteins_100g"), "fat": n.get("fat_100g"),
                    "carbs": n.get("carbohydrates_100g"), "fiber": n.get("fiber_100g"), "sugar": n.get("sugars_100g"),
                })
            with open(os.path.join(OUT, "off", f"{slug}.json"), "w", encoding="utf-8") as f:
                json.dump({"query": q, "url": url, "total": data.get("count"), "products": keep}, f, ensure_ascii=False, indent=1)
            print(f"OFF '{q}': {len(hits)} hits, {len(keep)} with full macros")
        except Exception as e:  # noqa: BLE001
            print(f"OFF '{q}': ERROR {e}")
        time.sleep(2)


def main() -> int:
    os.makedirs(os.path.join(OUT, "usda"), exist_ok=True)
    sets = discover_usda()
    print("USDA datasets:", json.dumps(sets, indent=1))
    ok = 0
    with open(os.path.join(OUT, "usda", "foods.csv"), "w", newline="", encoding="utf-8") as ff, \
         open(os.path.join(OUT, "usda", "portions.csv"), "w", newline="", encoding="utf-8") as pf:
        fw, pw = csv.writer(ff), csv.writer(pf)
        fw.writerow(["fdc_id", "dataset", "description", "kcal", "protein", "fat", "carbs", "fiber", "sugar"])
        pw.writerow(["fdc_id", "amount", "unit", "description", "gram_weight"])
        for label, url in sets.items():
            try:
                ok += process_usda(label, url, fw, pw) > 0
            except Exception as e:  # noqa: BLE001
                print(f"USDA {label}: ERROR {e}")
    with open(os.path.join(OUT, "usda", "SOURCE.txt"), "w", encoding="utf-8") as f:
        f.write("USDA FoodData Central (public domain, CC0): https://fdc.nal.usda.gov/\n")
        f.write(f"Downloaded {datetime.now(timezone.utc).isoformat(timespec='seconds')}\n")
        for label, url in sets.items():
            f.write(f"{label}: {url}\n")
    if "--skip-off" not in sys.argv:
        fetch_off()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
