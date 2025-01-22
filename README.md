# agent-r2d2-pod

To deploy to builder2:
./deploy.sh

It will automatically restart the service

The service is setup on builder2 here:
sudo vim /etc/systemd/system/agent-r2d2-pod.service

with:
[Unit]
Description=Agent Studio Support Service
After=network.target

[Service]
User=ushur
WorkingDirectory=/ushurapp/studio/tools/agent-r2d2-pod
ExecStart=/var/lib/snapd/snap/bin/node dist/index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target

----

Reload service file after change
sudo systemctl daemon-reload

Check service status:
sudo systemctl status agent-r2d2-pod.service

View logs
sudo journalctl -u agent-r2d2-pod.service

Tail logs
sudo journalctl -u agent-r2d2-pod.service -f

