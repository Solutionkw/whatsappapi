# Use the official Node.js 18 runtime
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy the rest of the application code
COPY . ./

# Tell the container which port to listen on
EXPOSE 8080

# Define the command to run your app
CMD [ "node", "App.js" ]
