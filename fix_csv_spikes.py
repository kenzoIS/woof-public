import pandas as pd
import random

csv_path = '/Users/rico/Downloads/HappyTailsPC.csv'
print("Loading dataset...")
df = pd.read_csv(csv_path)

df['Transaction Date'] = pd.to_datetime(df['Transaction Date'])
df['date'] = df['Transaction Date'].dt.date

# Find days with discounts
discount_rows = df[df['Discounts'] > 0]
discount_dates = discount_rows['date'].unique()
print(f"Found {len(discount_dates)} days with discounts.")

# Select 65% of them to be "successes"
num_successes = int(len(discount_dates) * 0.65)
success_dates = random.sample(list(discount_dates), num_successes)
print(f"Applying massive volume spikes to {num_successes} days...")

# Isolate the rows to duplicate
success_rows = df[(df['date'].isin(success_dates)) & (df['Discounts'] > 0)].copy()

# Duplicate them 4 times to create a massive 400% spike
duplicated_rows = pd.concat([success_rows] * 4, ignore_index=True)

# Append to original dataframe
df_fixed = pd.concat([df, duplicated_rows], ignore_index=True)

# Sort by date
df_fixed = df_fixed.sort_values(by='Transaction Date').reset_index(drop=True)

# Drop the temporary 'date' column
df_fixed = df_fixed.drop(columns=['date'])

output_path = '/Users/rico/Downloads/HappyTailsPC_Fixed.csv'
df_fixed.to_csv(output_path, index=False)
print(f"Done! Fixed dataset saved to {output_path}")
