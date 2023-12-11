<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

## Installation

1) Install dependencies.
```bash
$ npm install
```
2) Rename the .env.example file to .env and fill in the environment variables.
3) Start the database container if not using an external one.
```bash
$ docker compose up -d
```

## Running the app
Attention! The application utilizes deep caching of all data, so when manually modifying data in the database, it is necessary to restart the application.
```bash
$ npm run start
```

## Available routes
Note: If you have modified the port in the .env file, you need to update the port in the routes.

1) Retrieving a list of tasks for collecting company names based on postal code
```bash
# GET request
http://localhost:1337/postal-codes/unprocessed-companies
```
2) Inserting companies into the database
```bash
# POST request
http://localhost:1337/companies/insert-companies
# Example: Request body (RAW-JSON)
{
    "postal_code": "01193",
    "activity_code": "5024",
    "search_text": "",
    "companies": [
        {
          "name": string,
          "camara_link": string
        },
    ]
}
```
3) Retrieving a company for subsequent gathering of complete information
```bash
# GET request (any unprocessed companies)
http://localhost:1337/companies/one-pending
# GET request (unprocessed companies already having CIF code)
http://localhost:1337/companies/one-pending-with-cif
```
4) Assigning the ID value for a company to complete information in the remote database
```bash
# POST request
http://localhost:1337/companies/:id
# Example: Request body (RAW-JSON)
{
    "information_id": string
}
```
5) Resetting all postal codes. This operation will reset the state to NOTSTARTED for all postal codes, 
allowing the information gathering process to be restarted. Additionally, all difficult tasks and records 
of processed activity codes will be removed. Existing companies will not be affected.
```bash
# GET request
http://localhost:1337/postal-codes/reset-all
```
6) Generating difficult tasks for a specific street with house numbers. The search without a keyword will be
automatically deactivated for all activity codes and postal codes.
```bash
# POST request
http://localhost:1337/postal-codes/spawn-street-number-tasks
# Example: Request body (RAW-JSON)
{
    "postalCodeNumber": string,
    "streetName": string,
    "minNumber": string,
    "maxNumber": string
}
```
7) Generating complex tasks for a specific keyword (for example, a company name). Tasks will be generated for 
all postal codes and activity codes. The keyword will be placed in the searchText. Search without a keyword will
be automatically deactivated for all activity codes and postal codes.
```bash
# POST request
http://localhost:1337/postal-codes/spawn-keyword-tasks
# Example: Request body (RAW-JSON)
{
    "postalCodeNumber": string,
    "keyword": string
}
```