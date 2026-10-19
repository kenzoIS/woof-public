const fs = require('fs');
const path = '/Users/rico/Downloads/WOOF/WOOF_V1/backend/src/analytics/analytics.service.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(
  "return [];\n    }\n\n    return data;",
  "return [];\n    }\n\n    return data.map(row => ({\n      transactionTimestamp: row.transaction_timestamp,\n      productId: row.product_id,\n      serviceId: row.service_id,\n      channelId: row.channel_id,\n      segmentId: row.segment_id,\n      quantitySold: row.quantity_sold,\n      grossSales: row.gross_sales,\n      discountAmount: row.discount_amount,\n      discountDepth: row.discount_depth,\n      netSales: row.net_sales,\n      grossProfit: row.gross_profit\n    }));"
);
fs.writeFileSync(path, content);
