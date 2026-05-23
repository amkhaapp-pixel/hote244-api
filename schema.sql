-- Database Schema for Hotel Booking System

-- Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(50) DEFAULT 'user',
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin Table
CREATE TABLE admins (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin (password: admin123)
INSERT INTO admins (email, password, name) 
VALUES ('admin@hotel.com', '$2a$10$7R9ia3uG.zX0H/f8y7D1u.jN5h5Q0G6kZ7y5W5X9V5B5C5D5E5F5G', 'Super Admin');


-- Rooms Table
CREATE TABLE rooms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    capacity INT NOT NULL,
    description TEXT,
    images TEXT[], -- Array of image URLs
    amenities TEXT[], -- Array of amenities
    in_maintenance BOOLEAN NOT NULL DEFAULT FALSE,
    quantity INT DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bookings Table
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    room_id INT REFERENCES rooms(id),
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    room_count INT DEFAULT 1,
    status VARCHAR(50) DEFAULT 'pending', -- pending, paid, cancelled
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments Table
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    booking_id INT REFERENCES bookings(id),
    method VARCHAR(50) NOT NULL, -- QR, WeChat, Alipay
    status VARCHAR(50) DEFAULT 'pending', -- pending, completed, failed
    transaction_id VARCHAR(255),
    amount DECIMAL(10, 2) NOT NULL,
    slip_image_url TEXT, -- URL ของรูปสลิปหลักฐานการโอนเงิน (เก็บใน Cloudinary)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Settings Table
CREATE TABLE settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages Table
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    message TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'unread', -- unread, read, replied
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample Data for Rooms
INSERT INTO rooms (name, price, capacity, description, images, amenities) VALUES
('Deluxe Ocean View', 3500.00, 2, 'Stunning panoramic views of the ocean.', ARRAY['url1', 'url2'], ARRAY['Free Wi-Fi', 'Balcony']),
('Premium Suite', 5800.00, 4, 'Separated living area and city views.', ARRAY['url3', 'url4'], ARRAY['Free Wi-Fi', 'Kitchenette']),
('Standard Cozy Room', 2200.00, 2, 'Comfortable space for short stays.', ARRAY['url5'], ARRAY['Free Wi-Fi', 'TV']);
