#!/usr/bin/expect -f

# Build the application locally
puts "Running npm install locally..."
exec npm install

puts "Building the application locally..."
exec npm run build

puts "Creating deployment package..."
exec zip -r agent-r2d2-pod.zip dist/ package.json package-lock.json

# Local: Upload the ZIP to S3
puts "Uploading deployment package to S3..."
exec aws s3 cp agent-r2d2-pod.zip s3://ushur-nonprod-sftp/kam/

# Start the AWS SSM session on builder2
spawn aws ssm start-session --target i-0eee609a74068533a
expect "\n"

# Switch to the desired user
send "sudo su -l ushur\r"

# Create the deployment directory if it doesn't exist
send "mkdir -p /ushurapp/studio/tools/agent-r2d2-pod\r"

# Navigate to the deployment directory
send "cd /ushurapp/studio/tools//agent-r2d2-pod\r"

# Upload the ZIP package to the server using SSM
send "aws s3 cp s3://ushur-nonprod-sftp/kam/agent-r2d2-pod.zip .\r"

# Extract the ZIP package
send "unzip -o agent-r2d2-pod.zip\r"

# Install dependencies
puts "npm install"
send "npm install --production\r"

# Restart the service
puts "Restart the service"
send "sudo systemctl daemon-reload\r"
send "sudo systemctl restart agent-r2d2-pod.service\r"

# Verify the service is running
puts "Check if service is running"
send "sudo systemctl status agent-r2d2-pod.service\r"

# Exit the session
send "exit\r"
expect eof
