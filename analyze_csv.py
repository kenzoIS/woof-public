import pandas as pd

df = pd.read_csv('/Users/rico/Downloads/WOOF/WOOF_V1/HappyTailsPC_Fixed.csv')

# 1. Check Date Format
print(f"Total Rows: {len(df)}")
print("Sample Dates:")
print(df['Transaction Date'].head(5))

# 2. Convert to datetime
df['Transaction Date'] = pd.to_datetime(df['Transaction Date'], errors='coerce')
df['hour'] = df['Transaction Date'].dt.hour
df['date'] = df['Transaction Date'].dt.date

# 3. Check for the slump
hourly_sales = df.groupby('hour')['Items Sold'].sum()
print("\nHourly Sales Distribution:")
print(hourly_sales)

# 4. Check for discounts
discounted_rows = df[df['Discounts'] > 0]
print(f"\nTotal Discounted Rows: {len(discounted_rows)}")
if not discounted_rows.empty:
    discounted_dates = discounted_rows['date'].nunique()
    print(f"Number of distinct days with discounts: {discounted_dates}")
    
    # Check if the discount is roughly 15%
    avg_discount_depth = (discounted_rows['Discounts'] / discounted_rows['Gross Sales']).mean()
    print(f"Average Discount Depth on discounted items: {avg_discount_depth:.2%}")
    
    # Check volume spikes on discounted days vs non-discounted days during the slump hour
    slump_hour = hourly_sales.idxmin()
    print(f"\nAnalyzing Slump Hour: {slump_hour}:00")
    
    slump_data = df[df['hour'] == slump_hour]
    daily_slump_volume = slump_data.groupby(['date', 'Discounts'])['Items Sold'].sum().reset_index()
    
    discounted_slump_days = daily_slump_volume[daily_slump_volume['Discounts'] > 0]
    normal_slump_days = daily_slump_volume[daily_slump_volume['Discounts'] == 0]
    
    print(f"Average Items Sold on Normal Days at {slump_hour}:00 -> {normal_slump_days['Items Sold'].mean():.2f}")
    print(f"Average Items Sold on Discounted Days at {slump_hour}:00 -> {discounted_slump_days['Items Sold'].mean():.2f}")
    
