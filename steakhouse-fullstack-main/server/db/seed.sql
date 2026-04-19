
INSERT INTO branches (name) VALUES ('Uptown'),('Riverside'),('Downtown') ON CONFLICT (name) DO NOTHING;
INSERT INTO users (name,email,password,role,branch) VALUES
('Demo Customer','customer@demo.com','123','Customer',NULL),
('Chef Pedro','chef.uptown@demo.com','123','Chef','Uptown'),
('Chef Tiago','chef.riverside@demo.com','123','Chef','Riverside'),
('Chef Yamal','chef.downtown@demo.com','123','Chef','Downtown'),
('Manager Mia','manager@demo.com','123','Manager',NULL),
('Admin Alex','admin@demo.com','123','Admin',NULL),
('Ad Manager Ava','ad@demo.com','123','AdManager',NULL)
ON CONFLICT (email) DO NOTHING;
INSERT INTO menu_items (name,category,price,is_special,is_available) VALUES
('Stuffed Truffle','Special',42,true,true),
('Filet Mignon','Steak',56,false,true),
('Caviar Sushi','Seafood',68,false,true),
('House Salad','Sides',12,false,true),
('Ultra Exotic Ribeye','Special',74,true,true);
INSERT INTO suppliers (name,category,phones,address) VALUES
('Prime Meats Co.','Meat','+1 555 1122','12 Beef St, City'),
('Ocean Pearl','Seafood','+1 555 7788, +1 555 7789','7 Harbor Rd'),
('Greens & Co.','Produce','+1 555 3322','45 Farm Lane');
INSERT INTO employees (role,name,branch,salary,schedule) VALUES
('Chef','Yamal','Downtown',2700,'Wed-Sun'),
('Chef','Tiago','Riverside',2600,'Tue-Sat'),
('Chef','Pedro','Uptown',2750,'Thu-Mon');
INSERT INTO campaigns (title,platform,budget,status,kpi,duration,audience,description) VALUES
('Social Spring Push','Instagram',2000,'Planned','Followers +5%','4 weeks','25-40 foodies','Reels of chef specials.'),
('Local Radio Lunch','FM 99.1',1500,'Draft','Lunch traffic +8%','2 weeks','Commuters','Off-peak lunch spots.'),
('Billboard Downtown','OOH',5000,'Active','Bookings +10%','1 month','City center','Prime corner banner.');
INSERT INTO expenses (branch,month,category,amount,advisor_comment) VALUES
('Uptown','2025-09','Meat',8200,'Negotiate ribeye contract.'),
('Riverside','2025-09','Seafood',6100,'Caviar margin ok.'),
('Downtown','2025-09','Labor',9300,'Overtime high on Fridays.');
