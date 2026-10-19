import os, tempfile
path = os.path.join(tempfile.gettempdir(), "woof_rf_promo_model.joblib")
if os.path.exists(path):
    os.remove(path)
    print("Cache deleted.")
else:
    print("Cache not found.")
