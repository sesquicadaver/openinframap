https://overpass-turbo.eu/?Q=nwr%20%5Bamenity%3Dfountain%5D%20%28%7B%7Bbbox%7D%7D%29%20-%3E.water%20%3B%0Anwr%20%5Bamenity%3Dbench%5D%20%28around.water%3A10%29%20%3B%0Aout%3B%20%0A&C=59.427617%3B24.771767%3B11#

[out:json][timeout:25];
(
  node["substation"="traction"]({{bbox}});
  way["substation"="traction"]({{bbox}});
  relation["substation"="traction"]({{bbox}});
);
out body;
>;
out skel qt;
