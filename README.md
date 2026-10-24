# nails.musestudio

A React storefront for press-on nail sets with Razorpay Checkout. Customers can pay using the payment methods enabled on your Razorpay account, including UPI when UPI is activated.

## Run locally

1. Create a Razorpay account and generate **Test Mode** API keys in the Razorpay Dashboard.
2. Copy `.env.example` to `.env` and add your `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
3. Run `npm install`, then `npm run dev`.
4. Open the Vite URL shown in the terminal (usually `http://localhost:5173`).
5. In the Razorpay Dashboard, make sure UPI is enabled for your account and test the checkout before going live.

The server creates Razorpay orders using catalog prices, adds ₹79 shipping below ₹1,500, and verifies the Razorpay payment signature and captured payment status before confirming success. Delivery name, email, mobile number, and Indian address are collected before checkout and attached to the Razorpay order. Keep the key secret only in `.env`; never expose it in frontend code or commit it.

## Production

Build with `npm run build`, then start with `NODE_ENV=production npm start`. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to your **Live Mode** keys in the hosting provider's secret environment settings. Activate UPI and other payment methods in your Razorpay Dashboard and complete Razorpay's go-live requirements. The `.env` file is ignored by Git.
