package main

import "testing"

func TestBuildMongoURIStripsDuplicatePort(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "duplicate port on last replica set member",
			in:   "mongodb://user:pass@h1:27017,h2:27017,h3:27017:27017/admin?ssl=false",
			want: "mongodb://user:pass@h1:27017,h2:27017,h3:27017/admin?ssl=false",
		},
		{
			name: "no duplicate port — unchanged",
			in:   "mongodb://user:pass@h1:27017,h2:27017,h3:27017/admin?ssl=false",
			want: "mongodb://user:pass@h1:27017,h2:27017,h3:27017/admin?ssl=false",
		},
		{
			name: "single host no duplicate",
			in:   "mongodb://user:pass@h1:27017/admin",
			want: "mongodb://user:pass@h1:27017/admin",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := buildMongoURI(&Credentials{URI: tc.in})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("\ngot:  %s\nwant: %s", got, tc.want)
			}
		})
	}
}
