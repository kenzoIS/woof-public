import pandas as pd

df = pd.read_csv('/Users/rico/Downloads/WOOF/WOOF_V1/HappyTailsPC_Fixed.csv')

# The backend hash is: transactionId + dateStr + productName + quantity
# Let's create this hash in pandas to see how many duplicates there are
df['hash'] = df['Transaction ID'].astype(str) + '_' + df['Transaction Date'].astype(str) + '_' + df['Item Names'].astype(str) + '_' + df['Items Sold'].astype(str)

dupes = df.duplicated(subset=['hash'], keep='first')
print(f"Backend would drop {dupes.sum()} rows based on the hash.")

# Show a few examples of these dupes
print("\nExamples of dupes that backend would drop:")
print(df[df['hash'].isin(df[dupes]['hash'])].sort_values('hash').head(6)[['Transaction Date', 'Transaction ID', 'Item Names', 'Items Sold', 'Gross Sales', 'Discounts']])
