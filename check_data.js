const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://localhost:27017/woof_analytics');
  const db = mongoose.connection.db;
  const coll = db.collection('transactions');
  
  const sectors = await coll.distinct('sector');
  console.log('All Sectors:', sectors);
  
  const categories = await coll.distinct('category', { sector: { $in: ['Services', 'Grooming'] } });
  console.log('Service Categories:', categories);
  
  const subcategories = await coll.distinct('subcategory', { sector: { $in: ['Services', 'Grooming'] } });
  console.log('Service Subcategories:', subcategories);
  
  const productNames = await coll.distinct('productName', { sector: { $in: ['Services', 'Grooming'] } });
  console.log('Service ProductNames:', productNames);
  
  await mongoose.disconnect();
}
run().catch(console.error);
