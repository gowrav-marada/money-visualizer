-- Adds personal debit/credit records to one existing user in backend/App_Data/moneyvis.db.
-- 1. Sign in to the app once with Google so your user row exists, then stop the backend.
-- 2. Replace the email below with your Google email.
-- 3. Run this script in DB Browser for SQLite (Execute SQL tab), then Write Changes.

CREATE TEMP TABLE Owner AS SELECT Id FROM Users WHERE lower(Email) = lower('gowravsrikalyan1220@gmail.com');

CREATE TEMP TABLE Entries (Name TEXT, Direction TEXT, Amount TEXT);
INSERT INTO Entries VALUES
  ('Coral', 'Pay', '6532.0'), ('HSBC', 'Pay', '5200.0'), ('Axis', 'Pay', '69334.0'), ('HDFC', 'Pay', '11053.0'),
  ('Dady', 'Pay', '11500.0'), ('Chan', 'Pay', '45000.0'), ('Akila', 'Pay', '114800.0'), ('Venu', 'Pay', '18000.0'),
  ('Anuhya', 'Receive', '3800.0'), ('Amma', 'Receive', '5000.0'), ('Ran', 'Receive', '6600.0'), ('Split', 'Receive', '50711.0'),
  ('Sam', 'Receive', '24000.0'), ('Pav', 'Receive', '6000.0'), ('Vam', 'Receive', '20000.0'), ('Ran', 'Receive', '2700.0'),
  ('Dady', 'Receive', '30000.0'), ('Cash', 'Receive', '3500.0'), ('Sindhu', 'Receive', '72000.0');

INSERT INTO People (Id, Name, UserId, CreatedAt, UpdatedAt)
SELECT upper(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
			 substr('89AB', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
	   names.Name, (SELECT Id FROM Owner), datetime('now'), datetime('now')
FROM (SELECT DISTINCT Name FROM Entries) AS names
WHERE (SELECT Id FROM Owner) IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM People p WHERE p.UserId = (SELECT Id FROM Owner) AND lower(p.Name) = lower(names.Name));

INSERT INTO ReceivablePayables (Id, PersonId, Direction, Amount, SettledAmount, TransactionDate, Description, UserId, CreatedAt, UpdatedAt)
SELECT upper(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
			 substr('89AB', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
	   p.Id, e.Direction, e.Amount, '0.0', date('now', 'localtime'),
	   CASE e.Direction WHEN 'Pay' THEN 'Debit' ELSE 'Credit' END,
	   p.UserId, datetime('now'), datetime('now')
FROM Entries e
JOIN People p ON lower(p.Name) = lower(e.Name) AND p.UserId = (SELECT Id FROM Owner);

SELECT Direction, count(*) AS Records, sum(CAST(Amount AS REAL)) AS Total
FROM ReceivablePayables WHERE UserId = (SELECT Id FROM Owner) GROUP BY Direction;

DROP TABLE Entries;
DROP TABLE Owner;
