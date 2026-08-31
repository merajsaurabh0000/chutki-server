import 'dotenv/config.js';
import mongoose from 'mongoose';
import * as cheerio from 'cheerio';
import Product from '../src/models/products.js';
import Category from '../src/models/category.js';

const CATEGORIES_TO_SCRAPE = [
  {
    name: 'BIPAP Devices',
    url: 'https://respbuy.com/product-category/sleep-apnea-machine/bipap-devices/',
  },
  {
    name: 'CPAP Devices',
    url: 'https://respbuy.com/product-category/sleep-apnea-machine/cpap-devices/',
  },
  {
    name: 'Ventilator Devices',
    url: 'https://respbuy.com/product-category/hospital-equipments/ventilator-devices/',
  },
  {
    name: 'Oxygen Concentrators',
    url: 'https://respbuy.com/product-category/oxygen-concentrator/',
  },
  {
    name: 'Full Face Mask',
    url: 'https://respbuy.com/product-category/facemask/cpap-bipap-full-face-mask/',
  },
  {
    name: 'Nasal Mask',
    url: 'https://respbuy.com/product-category/facemask/cpap-bipap-nasal-mask/',
  },
  {
    name: 'Nasal Pillow Mask',
    url: 'https://respbuy.com/product-category/facemask/cpap-bipap-nasal-pillow-mask/',
  },
  {
    name: 'Hose Pipes & Tubes',
    url: 'https://respbuy.com/product-category/accessories/connecting-tubes/',
  },
  {
    name: 'Filters & Cleaners',
    url: 'https://respbuy.com/product-category/accessories/cpap-bipap-filters/',
  },
];

async function scrapeCategory(categoryInfo) {
  console.log(`Scraping category: ${categoryInfo.name} from ${categoryInfo.url}...`);
  try {
    const response = await fetch(categoryInfo.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${categoryInfo.url}: Status ${response.status}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const products = [];

    $('.product').each((index, element) => {
      const title = $(element).find('.woocommerce-loop-product__title').text().trim();
      if (!title) return;

      const image = $(element).find('.wp-post-image').attr('src') || '';
      
      // Parse prices
      let price = 0;
      let discountPrice = undefined;

      const priceElement = $(element).find('span.price');
      if (priceElement.length) {
        const insBdi = priceElement.find('ins span.woocommerce-Price-amount bdi');
        const delBdi = priceElement.find('del span.woocommerce-Price-amount bdi');
        const simpleBdi = priceElement.find('span.woocommerce-Price-amount bdi');

        if (insBdi.length && delBdi.length) {
          // Discounted product
          const cleanIns = insBdi.text().replace(/[^\d.]/g, '');
          const cleanDel = delBdi.text().replace(/[^\d.]/g, '');
          price = parseFloat(cleanDel) || 0;
          discountPrice = parseFloat(cleanIns) || undefined;
        } else if (simpleBdi.length) {
          // Simple product
          const cleanPrice = simpleBdi.first().text().replace(/[^\d.]/g, '');
          price = parseFloat(cleanPrice) || 0;
        }
      }

      // Default fallback if price parsing fails
      if (!price && discountPrice) {
        price = discountPrice;
        discountPrice = undefined;
      }
      if (!price) {
        price = 1500; // Fallback default price
      }

      products.push({
        name: title,
        brand: title.split(' ')[0] || 'Generic',
        description: `High-quality ${title}. Securely packed and delivered to your doorstep.`,
        image,
        price,
        discountPrice,
        quantity: '1 Unit',
      });
    });

    console.log(`Successfully scraped ${products.length} products for ${categoryInfo.name}`);
    return products;
  } catch (error) {
    console.error(`Error scraping category ${categoryInfo.name}:`, error);
    return [];
  }
}

async function startScraping() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is missing in environment!');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB Atlas database ✅');

    // Clear existing products & categories to keep database clean
    await Product.deleteMany({});
    await Category.deleteMany({});

    for (const catInfo of CATEGORIES_TO_SCRAPE) {
      const scrapedProducts = await scrapeCategory(catInfo);
      if (!scrapedProducts.length) continue;

      // 1. Create or Find Category
      let category = await Category.findOne({ name: catInfo.name });
      if (!category) {
        // Set first product's image as category thumbnail
        const categoryImage = scrapedProducts[0]?.image || '';
        category = await Category.create({ name: catInfo.name, image: categoryImage });
        console.log(`Created new category: ${category.name}`);
      }

      // 2. Insert Products
      let insertedCount = 0;
      for (const prodData of scrapedProducts) {
        // Avoid duplicate products by name
        const exists = await Product.findOne({ name: prodData.name });
        if (!exists) {
          await Product.create({
            ...prodData,
            category: category._id,
            categories: [category._id],
            source: 'respbuy_scraper',
          });
          insertedCount++;
        }
      }
      console.log(`Seeded ${insertedCount} new products into category: ${category.name}`);
    }

    console.log('WEBSITE SCRAPING AND DATABASE SEEDING COMPLETED SUCCESSFULLY! 🎉');
  } catch (error) {
    console.error('Fatal scraping error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
}

startScraping();
