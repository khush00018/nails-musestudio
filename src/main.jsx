import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { products } from "./products.js";
import "./styles.css";

const categories = ["All sets", "Classic", "Romantic", "Playful"];
const FREE_SHIPPING_THRESHOLD = 1500;
const priceFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const formatPrice = (amount) => priceFormatter.format(amount);

async function readApiResponse(response) {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Secure checkout is unavailable. Please refresh and try again.");
  }
  return response.json();
}

function Icon({ name, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (name === "bag") {
    return (
      <svg {...common}>
        <path d="M5 8h14l1 13H4L5 8Z" />
        <path d="M9 9V6a3 3 0 0 1 6 0v3" />
      </svg>
    );
  }
  if (name === "arrow") {
    return (
      <svg {...common}>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    );
  }
  if (name === "close") {
    return (
      <svg {...common}>
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    );
  }
  if (name === "minus") {
    return (
      <svg {...common}>
        <path d="M5 12h14" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3v18M3 12h18" />
    </svg>
  );
}

function App() {
  const [activeCategory, setActiveCategory] = useState("All sets");
  const [cart, setCart] = useState(() => {
    const savedCart =
      window.localStorage.getItem("nails-musestudio-cart") ||
      window.localStorage.getItem("tender-tips-cart");
    return savedCart ? JSON.parse(savedCart) : {};
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const shippingFormRef = React.useRef(null);

  React.useEffect(() => {
    window.localStorage.setItem("nails-musestudio-cart", JSON.stringify(cart));
  }, [cart]);

  const visibleProducts = useMemo(
    () =>
      activeCategory === "All sets"
        ? products
        : products.filter((product) => product.category === activeCategory),
    [activeCategory],
  );

  const cartItems = products
    .filter((product) => cart[product.id])
    .map((product) => ({ ...product, quantity: cart[product.id] }));
  const itemCount = cartItems.reduce((total, item) => total + item.quantity, 0);
  const subtotal = cartItems.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );

  function addToCart(productId) {
    setCart((current) => ({
      ...current,
      [productId]: (current[productId] || 0) + 1,
    }));
    setCheckoutError("");
    setNotice("A little something lovely, added to your bag.");
    setTimeout(() => setNotice(""), 2600);
  }

  function updateQuantity(productId, change) {
    setCart((current) => {
      const quantity = (current[productId] || 0) + change;
      const updated = { ...current };
      if (quantity <= 0) delete updated[productId];
      else updated[productId] = quantity;
      return updated;
    });
    setCheckoutError("");
  }

  async function beginCheckout() {
    if (cartItems.length === 0) return;
    if (!shippingFormRef.current?.reportValidity()) return;
    const shippingDetails = Object.fromEntries(
      new FormData(shippingFormRef.current).entries(),
    );
    setCheckoutLoading(true);
    setCheckoutError("");
    try {
      const response = await fetch("/api/create-razorpay-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartItems.map(({ id, quantity }) => ({ id, quantity })),
          shippingDetails,
        }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        throw new Error(result.error || "We couldn't start checkout. Please try again.");
      }
      await loadRazorpayCheckout();

      const checkout = new window.Razorpay({
        key: result.keyId,
        amount: result.amount,
        currency: result.currency,
        name: "nails.musestudio",
        description: "Press-on nail sets",
        order_id: result.orderId,
        prefill: {
          name: shippingDetails.fullName,
          email: shippingDetails.email,
          contact: shippingDetails.phone,
        },
        theme: { color: "#33312d" },
        handler: async (payment) => {
          try {
            const verificationResponse = await fetch("/api/verify-razorpay-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payment),
            });
            const verification = await readApiResponse(verificationResponse);
            if (!verificationResponse.ok) {
              throw new Error(verification.error || "We couldn't verify your payment.");
            }
            setCart({});
            setCartOpen(false);
            setNotice("Payment received. Thanks for shopping with us!");
            setTimeout(() => setNotice(""), 5000);
          } catch (error) {
            setCheckoutError(error.message || "We couldn't verify your payment.");
          } finally {
            setCheckoutLoading(false);
          }
        },
        modal: {
          ondismiss: () => setCheckoutLoading(false),
        },
      });
      checkout.on("payment.failed", (event) => {
        setCheckoutError(
          event.error?.description || "Your payment could not be completed. Please try again.",
        );
        setCheckoutLoading(false);
      });
      checkout.open();
    } catch (error) {
      setCheckoutError(error.message || "Something went wrong. Please try again.");
      setCheckoutLoading(false);
    }
  }

  function loadRazorpayCheckout() {
    if (window.Razorpay) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existingScript = document.querySelector("#razorpay-checkout");
      if (existingScript) {
        existingScript.addEventListener("load", resolve, { once: true });
        existingScript.addEventListener(
          "error",
          () => reject(new Error("Secure checkout couldn't load. Please try again.")),
          { once: true },
        );
        return;
      }
      const script = document.createElement("script");
      script.id = "razorpay-checkout";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = resolve;
      script.onerror = () =>
        reject(new Error("Secure checkout couldn't load. Please try again."));
      document.body.appendChild(script);
    });
  }

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      setCart({});
      setNotice("Your checkout is complete. Thanks for shopping small!");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("checkout") === "cancelled") {
      setNotice("No worries — your bag is saved for whenever you're ready.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.has("checkout")) setTimeout(() => setNotice(""), 5000);
  }, []);

  return (
    <>
      <div className="announcement">
        <span>Complimentary shipping on orders ₹1,500+</span>
        <span className="announcement-note">Your at-home mani, but make it magic ✳</span>
      </div>

      <header className="site-header">
        <a className="wordmark" href="#" aria-label="nails.musestudio home">
          nails<span>.musestudio</span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a className="nav-active" href="#shop">Shop all</a>
          <a href="#our-story">Our story</a>
          <a href="#faq">The details</a>
        </nav>
        <button
          className="bag-button"
          aria-label={`Open shopping bag, ${itemCount} items`}
          onClick={() => setCartOpen(true)}
        >
          <Icon name="bag" />
          <span>Bag</span>
          <span className="bag-count">{itemCount}</span>
        </button>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" />GOOD NAILS, GOOD MOOD</p>
            <h1>A little<br />self-care,<br /><em>at your fingertips.</em></h1>
            <p className="hero-description">
              Salon-worthy nails, without the salon appointment. Meet your new
              favorite five-minute ritual.
            </p>
            <a href="#shop" className="button button-dark">
              Find your set <Icon name="arrow" size={17} />
            </a>
            <div className="hero-social-proof">
              <div className="avatar-stack" aria-hidden="true">
                <span>J</span><span>M</span><span>A</span>
              </div>
              <div><strong>Loved by 12,000+ happy hands</strong><br /><span>★★★★★ <small>4.9/5 average rating</small></span></div>
            </div>
            <span className="hero-scribble" aria-hidden="true">you deserve this ↗</span>
          </div>
          <div className="hero-art">
            <div className="hero-image" role="img" aria-label="A fresh manicure in soft, natural light" />
            <div className="image-note"><span>✳</span> Your nails, your little moment.</div>
            <div className="hero-sticker"><span>made for</span><strong>your<br />kind of<br />lovely</strong><i>✷</i></div>
            <div className="hero-sparkle sparkle-one">✳</div>
            <div className="hero-sparkle sparkle-two">✴</div>
          </div>
          <div className="hero-bottom-note">PRESS. SET. GLOW.<span>01 / 04</span></div>
        </section>

        <section className="promise-bar" aria-label="Our promises">
          <div><span>✳</span> Salon-quality, always</div>
          <div><span>♡</span> Reusable up to 3 wears</div>
          <div><span>✦</span> On in 5 minutes flat</div>
          <div><span>☼</span> Kind to your natural nails</div>
        </section>

        <section className="shop-section" id="shop">
          <div className="section-heading">
            <div>
              <p className="eyebrow"><span className="eyebrow-line" />THE GOOD STUFF</p>
              <h2>Your next <em>little obsession.</em></h2>
            </div>
            <p>Thoughtfully designed. Ridiculously easy.<br />Very, very you.</p>
          </div>
          <div className="filter-row" role="group" aria-label="Filter nail sets">
            <div className="filters">
              {categories.map((category) => (
                <button
                  key={category}
                  className={`filter-button ${activeCategory === category ? "selected" : ""}`}
                  onClick={() => setActiveCategory(category)}
                  aria-pressed={activeCategory === category}
                >
                  {category}
                </button>
              ))}
            </div>
            <span className="product-count">MADE FOR REAL LIFE · {visibleProducts.length} SETS</span>
          </div>
          <div className="product-grid">
            {visibleProducts.map((product, index) => (
              <article className="product-card" key={product.id}>
                <div className="product-image-wrap" style={{ backgroundColor: product.color }}>
                  <img
                    src={product.image}
                    alt={`${product.name} press-on nail set`}
                    loading="lazy"
                  />
                  {product.badge && <span className="product-badge">{product.badge}</span>}
                  <button
                    className="quick-add"
                    aria-label={`Add ${product.name} to bag`}
                    onClick={() => addToCart(product.id)}
                  >
                    <Icon name="plus" size={17} /> <span>Quick add</span>
                  </button>
                </div>
                <div className="product-meta">
                  <div><h3>{product.name}</h3><p>{product.category} · 24 nails</p></div>
                  <strong>{formatPrice(product.price)}</strong>
                </div>
                <div className="product-rating"><span>★★★★★</span> {product.rating} <small>({product.reviews})</small></div>
              </article>
            ))}
          </div>
        </section>

        <section className="story-section" id="our-story">
          <div className="story-image" role="img" aria-label="Nail care essentials on a warm neutral background">
            <div className="story-stamp">A little<br />more you<br /><span>✳</span></div>
          </div>
          <div className="story-copy">
            <p className="eyebrow"><span className="eyebrow-line" />A NOTE FROM US</p>
            <h2>Because feeling<br />like <em>yourself</em> is<br />always in style.</h2>
            <p>
              We started nails.musestudio with one little thought: getting ready
              should feel like a treat, not another thing on your to-do list.
              So we made beautiful nails that fit into real life — and feel
              wonderfully like you.
            </p>
            <a className="text-link" href="#faq">A little more about us <Icon name="arrow" size={17} /></a>
          </div>
        </section>

        <section className="faq-section" id="faq">
          <p className="eyebrow"><span className="eyebrow-line" />THE LITTLE DETAILS</p>
          <h2>Good to <em>know.</em></h2>
          <div className="faq-grid">
            <div><span>01</span><h3>So easy to apply</h3><p>Find your fit, add a little adhesive, press for 30 seconds. Cute nails, no appointment necessary.</p></div>
            <div><span>02</span><h3>A set for every hand</h3><p>Each set comes with 24 nails in 12 sizes, so finding your just-right fit feels easy.</p></div>
            <div><span>03</span><h3>Made to be loved again</h3><p>With a little care, your set can be worn up to three times. More happy hands, less waste.</p></div>
          </div>
        </section>

        <section className="newsletter">
          <span className="newsletter-star">✳</span>
          <p className="eyebrow">A LITTLE NOTE FROM US</p>
          <h2>Good things, <em>in your inbox.</em></h2>
          <p>New sets, little rituals, and 10% off your first order.</p>
          <form onSubmit={(event) => { event.preventDefault(); setNotice("Thanks! Newsletter sign-up isn't connected yet."); setTimeout(() => setNotice(""), 3500); }}>
            <label className="visually-hidden" htmlFor="newsletter-email">Email address</label>
            <input id="newsletter-email" type="email" placeholder="Your email address" required />
            <button type="submit" aria-label="Subscribe to newsletter"><Icon name="arrow" /></button>
          </form>
          <small>No spam, ever. Just good nails and good things.</small>
        </section>
      </main>

      <footer className="site-footer">
        <a className="wordmark footer-wordmark" href="#">nails<span>.musestudio</span></a>
        <p>Little moments. Lovely nails. Made with care.</p>
        <div><a href="#shop">Shop</a><a href="#our-story">Our story</a><a href="mailto:hello@nails.musestudio">Say hello</a></div>
        <span className="copyright">© 2026 nails.musestudio. Made with a little love.</span>
      </footer>

      {notice && <div className="toast" role="status">{notice}</div>}

      {cartOpen && (
        <div className="drawer-backdrop" onClick={() => setCartOpen(false)}>
          <aside
            className="cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-header">
              <div><p className="eyebrow">YOUR LITTLE LINEUP</p><h2 id="cart-title">Your bag <span>({itemCount})</span></h2></div>
              <button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Close shopping bag"><Icon name="close" /></button>
            </div>
            {cartItems.length === 0 ? (
              <div className="empty-cart"><span>♡</span><h3>A little room for lovely.</h3><p>Your bag is waiting for its first set.</p><button className="button button-dark" onClick={() => { setCartOpen(false); document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" }); }}>Find your set <Icon name="arrow" size={17} /></button></div>
            ) : (
              <>
                <div className="cart-items">
                  {cartItems.map((item) => (
                    <div className="cart-item" key={item.id}>
                      <img src={item.image} alt="" />
                      <div className="cart-item-info"><h3>{item.name}</h3><p>{item.category} · 24 nails</p><div className="quantity-control"><button onClick={() => updateQuantity(item.id, -1)} aria-label={`Remove one ${item.name}`}><Icon name="minus" size={14} /></button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.id, 1)} aria-label={`Add one ${item.name}`}><Icon name="plus" size={14} /></button></div></div>
                      <strong>{formatPrice(item.price * item.quantity)}</strong>
                    </div>
                  ))}
                  <form
                    ref={shippingFormRef}
                    className="shipping-form"
                    onSubmit={(event) => event.preventDefault()}
                  >
                    <h3>Where should we send your set?</h3>
                    <label>
                      Full name
                      <input name="fullName" autoComplete="name" maxLength="100" required />
                    </label>
                    <label>
                      Email
                      <input name="email" type="email" autoComplete="email" maxLength="254" required />
                    </label>
                    <label>
                      Mobile number
                      <input
                        name="phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        pattern="[6-9][0-9]{9}"
                        title="Enter a valid 10-digit Indian mobile number."
                        maxLength="10"
                        required
                      />
                    </label>
                    <label>
                      Address
                      <input name="addressLine1" autoComplete="address-line1" maxLength="200" required />
                    </label>
                    <div className="shipping-form-row">
                      <label>
                        City
                        <input name="city" autoComplete="address-level2" maxLength="100" required />
                      </label>
                      <label>
                        State
                        <input name="state" autoComplete="address-level1" maxLength="100" required />
                      </label>
                    </div>
                    <label>
                      PIN code
                      <input
                        name="pincode"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        pattern="[0-9]{6}"
                        title="Enter a valid 6-digit PIN code."
                        maxLength="6"
                        required
                      />
                    </label>
                  </form>
                </div>
                <div className="cart-summary">
                  <div><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></div>
                  <p>₹79 shipping, complimentary on orders ₹1,500+.</p>
                  {subtotal < FREE_SHIPPING_THRESHOLD && <p className="shipping-progress">You're {formatPrice(FREE_SHIPPING_THRESHOLD - subtotal)} away from complimentary shipping.</p>}
                  {checkoutError && <p className="checkout-error" role="alert">{checkoutError}</p>}
                  <button className="button button-dark checkout-button" onClick={beginCheckout} disabled={checkoutLoading}>
                    {checkoutLoading ? "Opening secure checkout..." : "Pay securely with UPI"}
                    {!checkoutLoading && <Icon name="arrow" size={17} />}
                  </button>
                  <p className="secure-note">UPI apps, cards &amp; more · Powered by Razorpay</p>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<App />);
if (import.meta.hot) {
  import.meta.hot.dispose(() => root.unmount());
}
