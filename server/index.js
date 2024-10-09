
import express from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const MongoDBConn = async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URL);
      console.log('MongoDB connected');
    } catch (e) {
      console.error('MongoDB connection error:', e.message);
    }
  };
  MongoDBConn();

const transactionSchema = new mongoose.Schema({
    title: String,
    description: String,
    price: Number,
    dateOfSale: Date,
    category: String,
    sold: Boolean
});

const Transaction = mongoose.model('Transaction', transactionSchema);

app.get('/initialize', async (req, res) => {
    try {
        const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
        const data = response.data;

      
        await Transaction.deleteMany({}); 
        await Transaction.insertMany(data); 

        res.status(200).send('Database initialized successfully');
    } catch (error) {
        res.status(500).send('Error initializing database');
    }
});

// API to list transactions with search and pagination
app.get('/transactions', async (req, res) => {
    const { search = '', page = 1, perPage = 10, month } = req.query;

    // Build the query
    const searchQuery = {
        $and: [
            { dateOfSale: { $regex: `^\\d{4}-${month.padStart(2, '0')}-` } }, 
            {
                $or: [
                    { title: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } },
                    { price: { $regex: search } }
                ]
            }
        ]
    };

    // Pagination

    const skip = (page - 1) * perPage;

    try {
        const transactions = await Transaction.find(searchQuery)
            .skip(skip)
            .limit(Number(perPage));

        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// API to get statistics of sold and unsold items for the selected month

app.get('/statistics', async (req, res) => {
    const { month } = req.query;

    try {
        const totalSales = await Transaction.aggregate([
            { $match: { dateOfSale: { $regex: `^\\d{4}-${month.padStart(2, '0')}-` } } },
            { $group: { _id: null, totalSaleAmount: { $sum: '$price' } } }
        ]);

        const totalSold = await Transaction.countDocuments({
            dateOfSale: { $regex: `^\\d{4}-${month.padStart(2, '0')}-` },
            sold: true
        });

        const totalUnsold = await Transaction.countDocuments({
            dateOfSale: { $regex: `^\\d{4}-${month.padStart(2, '0')}-` },
            sold: false
        });

        res.json({
            totalSaleAmount: totalSales[0]?.totalSaleAmount || 0,
            totalSoldItems: totalSold,
            totalUnsoldItems: totalUnsold
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// API to get price range data for bar chart

app.get('/price-range', async (req, res) => {
    const { month } = req.query;

    const ranges = [
        { range: '0-100', min: 0, max: 100 },
        { range: '101-200', min: 101, max: 200 },
        { range: '201-300', min: 201, max: 300 },
        { range: '301-400', min: 301, max: 400 },
        { range: '401-500', min: 401, max: 500 },
        { range: '501-600', min: 501, max: 600 },
        { range: '601-700', min: 601, max: 700 },
        { range: '701-800', min: 701, max: 800 },
        { range: '801-900', min: 801, max: 900 },
        { range: '901-above', min: 901, max: Infinity }
    ];

    try {
        const result = await Promise.all(
            ranges.map(async (range) => {
                const count = await Transaction.countDocuments({
                    dateOfSale: { $regex: `^\\d{4}-${month.padStart(2, '0')}-` },
                    price: { $gte: range.min, $lte: range.max }
                });
                return { range: range.range, count };
            })
        );

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch price range data' });
    }
});

// API to get category breakdown for pie chart

app.get('/category-breakdown', async (req, res) => {
    const { month } = req.query;

    try {
        const result = await Transaction.aggregate([
            { $match: { dateOfSale: { $regex: `^\\d{4}-${month.padStart(2, '0')}-` } } },
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);

        res.json(result.map(item => ({ category: item._id, count: item.count })));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch category breakdown' });
    }
});

// API to combine all three responses

app.get('/combined', async (req, res) => {
    const { month } = req.query;

    try {
        const statistics = await axios.get(`http://localhost:3000/statistics?month=${month}`);
        const priceRange = await axios.get(`http://localhost:3000/price-range?month=${month}`);
        const categoryBreakdown = await axios.get(`http://localhost:3000/category-breakdown?month=${month}`);

        res.json({
            statistics: statistics.data,
            priceRange: priceRange.data,
            categoryBreakdown: categoryBreakdown.data
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to combine data' });
    }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
