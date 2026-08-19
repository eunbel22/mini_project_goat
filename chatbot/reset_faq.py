from pathlib import Path
import shutil

p = Path(__file__).parent
shutil.copy2(p / "baseline" / "faq.json", p / "faq.json")
print("FAQ 초기화 완료 (baseline/faq.json으로 되돌림)")
