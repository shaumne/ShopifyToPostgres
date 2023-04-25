import axios from 'axios';
import pg from 'pg';

export function handler(event){

const shopifyAxios = axios.create({
    baseURL: 'https://domain.myshopify.com/admin/api/2023-01/',
    headers: { "content-type": "application/json", },
    auth: {
        "username": "your-api-key",
        "password": "your-pass"
    }
});

const pool = new pg.Pool({
    user: 'user',
    host: 'host',
    database: 'db-name',
    password: 'db-pass',
    port: 5432
});

const getShopifyOrders = async () => {
    const orders = [];
    let since_id = 0;
    while (true) {
        const res = await shopifyAxios.get('orders.json', {
            params: {

                status: 'any',
                financial_status: 'any',
                fulfillment_status: 'any',
                limit: 250,
                since_id
            },
        });
        const { data } = res;
        orders.push(...data.orders);
        if (data.orders.length < 250) break;
        since_id = data.orders[data.orders.length - 1].id;
        page++;
    }
    return orders;
};

const insertOrdersToDatabase = async (orders) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const order of orders) {
            const {
                id,
                email,
                financial_status,
                total_price,
                created_at,
                updated_at,
                payment_gateway_names,
                note
            } = order;
            const first_name = order["customer"]?.["first_name"];
            const last_name = order["customer"]?.["last_name"];
            const city = order["customer"]?.["default_address"]?.["city"];
            const country = order["customer"]?.["default_address"]?.["country_code"];
            const address1 = order["customer"]?.["default_address"]?.["address1"];


            // Check if the order already exists in the database
            const result = await client.query('SELECT EXISTS(SELECT 1 FROM orders WHERE shopify_id=$1)', [id]);
            const orderExists = result.rows[0].exists;
            let query
            if (!orderExists) {
                query = {
                    text: `INSERT INTO orders
                        (shopify_id, date_created, customer_first_name, customer_last_name, customer_email, address_1, city, country, total_price, payment_method_title, channel_id, order_notes)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                    values: [id, created_at, first_name, last_name, email, address1, city, country, total_price, payment_gateway_names, 1, note],
                };
                await client.query(query);

                if (city == 'İstanbul' || city == "İSTANBUL" ||city ==  "istanbul" ||city ==  "Istanbul" || city == "ISTANBUL") {
                    query = {
                        text: `UPDATE orders
                            SET
                            state = 'TR34'
                            where shopify_id = $1`,
                        values: [id],
                    }
                    await client.query(query);
                }
            }
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
};
const syncShopifyOrdersToDatabase = async () => {
    try {
        const orders = await getShopifyOrders();
        await insertOrdersToDatabase(orders);
        console.log(`Successfully synced ${orders.length} orders to the database`);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
};

syncShopifyOrdersToDatabase();    
}

handler({

})