CREATE TABLE IF NOT EXISTS devices (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(20) NOT NULL,
    type VARCHAR(20) NULL,
    location VARCHAR(50) NOT NULL DEFAULT 'Nao informado',
    external_url VARCHAR(2048) NULL,
    mac_address VARCHAR(20) NULL,
    ip_address VARCHAR(15) NULL,
    status TINYINT NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    CONSTRAINT devices_mac_address_unique UNIQUE (mac_address)
);
