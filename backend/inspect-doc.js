const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Transaction = mongoose.model('Transaction', new mongoose.Schema({}, { strict: false }), 'transactions');
  const doc = await Transaction.findOne();
  if (doc) {
    console.log("Transaction ID:", doc._id);
    console.log("csvUploadId type:", typeof doc.csvUploadId);
    console.log("csvUploadId value:", doc.csvUploadId);
    if (doc.csvUploadId && doc.csvUploadId.constructor) {
      console.log("csvUploadId constructor:", doc.csvUploadId.constructor.name);
    }
  } else {
    console.log("No transactions found.");
  }
  process.exit(0);
}
run();
