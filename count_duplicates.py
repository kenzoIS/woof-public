import pandas as pd

def count_dupes(file_path):
    try:
        df = pd.read_csv(file_path)
        dupes = df.duplicated().sum()
        print(f"{file_path}: {dupes} exact duplicate rows")
    except Exception as e:
        print(f"Error reading {file_path}: {e}")

count_dupes('/Users/rico/Downloads/WOOF/WOOF_V1/HappyTailsPC_Fixed.csv')
count_dupes('/Users/rico/Downloads/HappyTailsPC.csv')
