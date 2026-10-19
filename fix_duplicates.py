import pandas as pd
import random

df = pd.read_csv('/Users/rico/Downloads/WOOF/WOOF_V1/HappyTailsPC_Fixed.csv')

# Find duplicated rows
dupes_mask = df.duplicated(keep='first')

print(f"Fixing {dupes_mask.sum()} exact duplicate transaction IDs...")

# Generate a random unique transaction ID for the duplicates
# Base transaction IDs in the original dataset are 5-6 digits (e.g. 87561)
# We will just add a large offset to make them unique
df.loc[dupes_mask, 'Transaction ID'] = df.loc[dupes_mask, 'Transaction ID'].apply(
    lambda x: x + random.randint(1000000, 9000000)
)

# Save back to CSV
df.to_csv('/Users/rico/Downloads/WOOF/WOOF_V1/HappyTailsPC_Fixed.csv', index=False)
print("Done! Fixed CSV saved.")
