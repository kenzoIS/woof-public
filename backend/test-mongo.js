const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const TransactionSchema = new mongoose.Schema({
    transactionId: String,
    date: Date,
    netSales: Number
  });
  
  const Transaction = mongoose.model('Transaction', TransactionSchema, 'transactions');
  
  try {
    const res = await Transaction.aggregate([
      {
        $group: {
          _id: '$transactionId',
          total: { $sum: '$netSales' }
        }
      }
    ], { allowDiskUse: true }).allowDiskUse(true);
    console.log("Success with both");
  } catch (err) {
    console.error("Error with both:", err.message);
  }

  try {
    const res = await Transaction.aggregate([
      {
        $group: {
          _id: '$transactionId',
          total: { $sum: '$netSales' }
        }
      }
    ]).allowDiskUse(true);
    console.log("Success with allowDiskUse()");
  } catch (err) {
    console.error("Error with allowDiskUse():", err.message);
  }

  try {
    const res = await Transaction.aggregate([
      {
        $group: {
          _id: '$transactionId',
          total: { $sum: '$netSales' }
        }
      }
    ], { allowDiskUse: true });
    console.log("Success with options object");
  } catch (err) {
    console.error("Error with options object:", err.message);
  }
  
  mongoose.disconnect();
}
run();
